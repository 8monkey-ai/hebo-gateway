import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";

import { createAnthropic } from "@ai-sdk/anthropic";
import { MockProviderV4 } from "ai/test";

import { models } from "../endpoints/models/handler.ts";
import { withCanonicalIdsForAnthropic } from "../providers/anthropic/canonical.ts";
import { withCanonicalIds } from "../providers/registry.ts";
import { createModelCatalog, normalizeCatalog } from "./catalog.ts";
import type { ModelsDevApi } from "./models-dev.ts";
import type { ModelCatalog } from "./types.ts";

const CATALOG: ModelCatalog = {
  "anthropic/claude-a-1": { name: "A", providers: ["anthropic", "bedrock"] },
  "anthropic/claude-b-1": { name: "B", providers: ["anthropic"] },
  "openai/gpt-x": { name: "X", providers: ["openai"] },
};

const providers = { anthropic: new MockProviderV4(), openai: new MockProviderV4() };

const API: ModelsDevApi = {
  anthropic: {
    models: {
      "claude-live-1": {
        name: "Claude Live 1",
        modalities: { input: ["text"], output: ["text"] },
      },
    },
  },
};

let urls = 0;
// The remote catalog is shared per URL across the process, so every test gets its own.
const nextUrl = () => `https://catalog.test/${++urls}.json`;

afterEach(() => {
  mock.restore();
});

describe("normalizeCatalog", () => {
  test("filters with include and exclude patterns", () => {
    const out = normalizeCatalog(
      CATALOG,
      { include: ["anthropic/*", "openai/gpt-x"], exclude: ["*-b-*"] },
      providers,
    );
    expect(Object.keys(out)).toEqual(["anthropic/claude-a-1", "openai/gpt-x"]);
  });

  test("keeps only configured providers and drops models left without one", () => {
    const out = normalizeCatalog(CATALOG, {}, { anthropic: new MockProviderV4() });
    expect(out).toEqual({
      "anthropic/claude-a-1": { name: "A", providers: ["anthropic"] },
      "anthropic/claude-b-1": { name: "B", providers: ["anthropic"] },
    });
  });

  test("merges overrides, and adds models that are missing or filtered out", () => {
    const out = normalizeCatalog(
      CATALOG,
      {
        include: ["anthropic/claude-a-1"],
        overrides: {
          "anthropic/claude-a-1": { name: "Renamed" },
          "openai/gpt-x": { context: 1000 },
          "acme/custom": { name: "Custom", providers: ["openai"] },
          "acme/no-provider": { name: "Dropped" },
        },
      },
      providers,
    );

    expect(out).toEqual({
      "anthropic/claude-a-1": { name: "Renamed", providers: ["anthropic"] },
      "openai/gpt-x": { name: "X", context: 1000, providers: ["openai"] },
      "acme/custom": { name: "Custom", providers: ["openai"] },
    });
  });

  test("drops providers that cannot resolve the model's native ID", () => {
    const scoped = {
      anthropic: withCanonicalIdsForAnthropic(createAnthropic({ apiKey: "test" })),
      openai: withCanonicalIds(new MockProviderV4(), { namespaces: [] }),
    };

    const out = normalizeCatalog(
      {
        "anthropic/claude-a-1": { providers: ["anthropic"] },
        "openai/claude-a-1": { providers: ["anthropic", "openai"] },
      },
      { overrides: { "acme/forced": { providers: ["openai"] } } },
      scoped,
    );

    expect(out).toEqual({
      "anthropic/claude-a-1": { providers: ["anthropic"] },
      // Providers named in `overrides` are trusted as is.
      "acme/forced": { providers: ["openai"] },
    });
  });
});

describe("createModelCatalog", () => {
  test("uses the bundled snapshot right away when the source is disabled", () => {
    const fetchSpy = spyOn(globalThis, "fetch");
    const store = createModelCatalog(
      { source: false, include: ["anthropic/*"] },
      { anthropic: new MockProviderV4() },
    );

    expect(Object.keys(store.current!).length).toBeGreaterThan(0);
    expect(Object.keys(store.current!).every((id) => id.startsWith("anthropic/"))).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("does not fetch when only overrides are included", async () => {
    const fetchSpy = spyOn(globalThis, "fetch");
    const store = createModelCatalog(
      { include: [], overrides: { "acme/m": { providers: ["openai"] } } },
      providers,
    );

    expect(await store.load()).toEqual({ "acme/m": { providers: ["openai"] } });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("throws when the bundled snapshot has no model for the configured providers", () => {
    expect(() => createModelCatalog({ source: false }, { acme: new MockProviderV4() })).toThrow(
      "No models configured",
    );
  });

  test("loads the live catalog once and shares it", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(Response.json(API));
    const url = nextUrl();
    const config = { source: url, include: ["anthropic/*"] };

    const store = createModelCatalog(config, providers);
    expect(store.current).toBeUndefined();

    const [a, b] = await Promise.all([store.load(), store.load()]);
    expect(a).toEqual({
      "anthropic/claude-live-1": {
        name: "Claude Live 1",
        modalities: { input: ["text"], output: ["text"] },
        providers: ["anthropic"],
      },
    });
    expect(b).toBe(a);
    expect(store.current).toBe(a);

    // Another gateway in the same process reuses the response.
    await createModelCatalog(config, providers).load();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test("falls back to the bundled snapshot when loading fails", async () => {
    spyOn(globalThis, "fetch").mockResolvedValue(new Response("down", { status: 503 }));
    const config = { source: nextUrl(), include: ["anthropic/*"] };

    const loaded = await createModelCatalog(config, providers).load();
    const bundled = createModelCatalog({ ...config, source: false }, providers).current;
    expect(loaded).toEqual(bundled!);
  });

  test("falls back to the bundled snapshot when the payload has no usable model", async () => {
    spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ nope: true }));
    const config = { source: nextUrl(), include: ["anthropic/*"] };

    const loaded = await createModelCatalog(config, providers).load();
    expect(Object.keys(loaded).length).toBeGreaterThan(0);
    expect(loaded["anthropic/claude-live-1"]).toBeUndefined();
  });
});

test("the first request waits for the live catalog", async () => {
  spyOn(globalThis, "fetch").mockResolvedValue(Response.json(API));

  const endpoint = models({
    providers: { anthropic: new MockProviderV4() },
    models: { source: nextUrl() },
  });

  const res = await endpoint.handler(new Request("http://localhost/models"));
  const body = (await res.json()) as { data: { id: string }[] };
  expect(body.data.map((m) => m.id)).toEqual(["anthropic/claude-live-1"]);
});
