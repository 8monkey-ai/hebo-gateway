import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";

import { MockLanguageModelV4, MockProviderV4 } from "ai/test";

import { models } from "../endpoints/models/handler.ts";
import { getModelSpec, getModelSpecs, specOf, withCanonicalIds } from "../providers/registry.ts";
import { claude } from "./anthropic/presets.ts";
import { createModelCatalog, defineModelCatalog, registerModels } from "./catalog.ts";
import { defineModelFamily } from "./family.ts";
import type { ModelsDevApi } from "./models-dev.ts";
import type { CatalogModel, ModelsDevCatalog, ModelsDevCatalogModel } from "./types.ts";

// A models.dev model, with the spec of each provider.
const model = (name: string, created: string, extra: Partial<ModelsDevCatalogModel> = {}) =>
  ({
    name,
    family: name.split(" ")[0]!.toLowerCase(),
    created,
    providers: { a: { id: `native-${name}`, output: 1000 }, b: { id: `other-${name}` } },
    ...extra,
  }) satisfies ModelsDevCatalogModel;

// A custom model: providers only.
const custom = (name: string, created: string) =>
  ({
    name,
    family: name.split(" ")[0]!.toLowerCase(),
    created,
    providers: ["a", "b"],
  }) satisfies CatalogModel;

// How the gateway catalog lists a models.dev model.
const listed = (m: ModelsDevCatalogModel | undefined) => ({
  ...m!,
  providers: Object.keys(m!.providers),
});

// A fake lab, so no real lab registration is touched.
const ACME: ModelsDevCatalog = {
  "acme/rocket-1": model("Rocket 1", "2026-01-01"),
  "acme/rocket-1.5": model("Rocket 1.5", "2026-03-01"),
  "acme/rocket-2": model("Rocket 2", "2026-06-01"),
  "acme/rocket-2-preview": model("Rocket 2 Preview", "2026-07-01"),
  "acme/rocket-3": model("Rocket 3", "2026-08-01", { status: "beta" }),
  "acme/anvil-2": model("Anvil 2", "2026-05-01"),
};

const acme = registerModels({
  namespace: "acme",
  snapshot: ACME,
  extras: {
    "acme/rocket-4": model("Rocket 4", "2026-09-01"),
    // Already listed upstream: the upstream entry wins.
    "acme/rocket-2": model("Rocket 2 (extra)", "2026-06-01"),
    // A provider missing upstream is filled in; listed ones keep their upstream spec.
    "acme/rocket-1": {
      name: "Rocket 1 (extra)",
      providers: { c: { id: "native-c-Rocket 1" }, a: { id: "ignored" } },
    },
  },
});

const rocket = defineModelFamily(acme, {
  version: /^rocket-(\d+(?:\.\d+)?)$/u,
  groups: { stable: ["rocket-1", "rocket-2"] },
});

const providers = { a: new MockProviderV4(), b: new MockProviderV4() };
const offline = { source: false } as const;

const resolve = (...inputs: Parameters<typeof defineModelCatalog>) =>
  createModelCatalog(defineModelCatalog(...inputs), providers, offline).current!;

afterEach(() => {
  mock.restore();
});

describe("defineModelCatalog", () => {
  test("selects models by ID and pattern", () => {
    expect(Object.keys(resolve("acme/anvil-2", "acme/rocket-1*"))).toEqual([
      "acme/anvil-2",
      "acme/rocket-1",
      "acme/rocket-1.5",
    ]);
  });

  test("selects family groups, created on first access for any version", () => {
    expect(Object.keys(resolve(rocket.all))).toEqual([
      "acme/rocket-1",
      "acme/rocket-1.5",
      "acme/rocket-2",
      "acme/rocket-3",
      "acme/rocket-4",
    ]);
    expect(Object.keys(resolve(rocket["v1.x"]))).toEqual(["acme/rocket-1", "acme/rocket-1.5"]);
    expect(Object.keys(resolve(rocket["v1"]))).toEqual(["acme/rocket-1"]);
    expect(Object.keys(resolve(rocket.stable))).toEqual(["acme/rocket-1", "acme/rocket-2"]);
    expect(resolve("acme/anvil-2", rocket["v9.x"])).toEqual({
      "acme/anvil-2": listed(ACME["acme/anvil-2"]),
    });
  });

  test("latest is the newest stable release of each family", () => {
    expect(Object.keys(resolve(rocket.latest))).toEqual(["acme/rocket-4"]);

    const anvil = defineModelFamily(acme, { version: /^(?:anvil|rocket)-/u });
    const latest = Object.keys(resolve(anvil.latest));
    latest.sort();
    expect(latest).toEqual(["acme/anvil-2", "acme/rocket-4"]);
  });

  test("applies group overrides, narrowing and reordering providers", () => {
    expect(resolve(rocket["v2"]!({ name: "Renamed", providers: ["b", "missing"] }))).toEqual({
      "acme/rocket-2": { ...ACME["acme/rocket-2"], name: "Renamed", providers: ["b"] },
    });
  });

  test("custom models only fill gaps, and groups see them", () => {
    const rocket5 = custom("Rocket 5", "2026-10-01");
    const out = resolve(rocket.latest, {
      "acme/rocket-5": rocket5,
      "acme/anvil-2": custom("Anvil 2 (custom)", "2026-05-01"),
    });

    expect(Object.keys(out)).toEqual(["acme/rocket-5", "acme/anvil-2"]);
    expect(out["acme/rocket-5"]).toEqual(rocket5);
    expect(out["acme/anvil-2"]).toEqual(listed(ACME["acme/anvil-2"]));
  });

  test("lab extras only fill gaps", () => {
    const out = resolve("acme/rocket-2", "acme/rocket-4");
    expect(out["acme/rocket-2"]!.name).toBe("Rocket 2");
    expect(out["acme/rocket-4"]!.name).toBe("Rocket 4");
  });

  test("lab extras fill a provider missing upstream", () => {
    const c = withCanonicalIds(new MockProviderV4());
    const a = withCanonicalIds(new MockProviderV4());
    const out = createModelCatalog(
      defineModelCatalog("acme/rocket-1"),
      { ...providers, a, c },
      offline,
    ).current!;

    // Upstream data and provider order win, the missing provider comes last.
    expect(out["acme/rocket-1"]).toEqual({
      ...listed(ACME["acme/rocket-1"]),
      providers: ["a", "b", "c"],
    });
    expect(getModelSpecs(c)?.get("acme/rocket-1")).toEqual({ id: "native-c-Rocket 1" });
    expect(getModelSpecs(a)?.get("acme/rocket-1")).toBe(ACME["acme/rocket-1"]!.providers["a"]);
  });

  test("families only match models of their lab", () => {
    registerModels({
      namespace: "other",
      snapshot: {
        "other/rocket-9": model("Rocket 9", "2026-11-01"),
        "other/anvil-9": model("Anvil 9", "2026-11-01"),
      },
    });
    expect(Object.keys(resolve(rocket.all, "other/anvil-9"))).not.toContain("other/rocket-9");
  });

  test("skips undefined inputs and flattens arrays", () => {
    expect(Object.keys(resolve(undefined, [["acme/anvil-2"], rocket["v1"]]))).toEqual([
      "acme/anvil-2",
      "acme/rocket-1",
    ]);
  });
});

describe("createModelCatalog", () => {
  test("keeps only configured providers and drops models left without one", () => {
    const store = createModelCatalog(
      defineModelCatalog(rocket["v1.x"]),
      { b: providers.b },
      offline,
    );
    expect(store.current).toEqual({
      "acme/rocket-1": { ...ACME["acme/rocket-1"], providers: ["b"] },
      "acme/rocket-1.5": { ...ACME["acme/rocket-1.5"], providers: ["b"] },
    });
  });

  test("hands the model specs to the providers wrapped with withCanonicalIds", () => {
    const a = withCanonicalIds(new MockProviderV4());
    createModelCatalog(defineModelCatalog("acme/anvil-2"), { a }, offline);
    expect(getModelSpecs(a)?.get("acme/anvil-2")).toBe(ACME["acme/anvil-2"]!.providers["a"]);
  });

  test("shares the model specs with every instance wrapped for the same provider ID", () => {
    const seen: string[] = [];
    const byokBase = new MockProviderV4();
    byokBase.languageModel = (id: string) => {
      seen.push(id);
      return new MockLanguageModelV4({ modelId: id });
    };

    const configured = withCanonicalIds(new MockProviderV4(), { providerId: "a" });
    createModelCatalog(defineModelCatalog("acme/anvil-2"), { a: configured }, offline);
    // E.g. created per request in a `resolveProvider` hook, with the customer's credentials.
    const byok = withCanonicalIds(byokBase, { providerId: "a" });

    expect(getModelSpec(byok, "acme/anvil-2")).toBe(ACME["acme/anvil-2"]!.providers["a"]);
    // Middleware reads the spec off the model it is given.
    const anvil = byok.languageModel("acme/anvil-2") as MockLanguageModelV4;
    expect(specOf(anvil)).toBe(ACME["acme/anvil-2"]!.providers["a"]!);
    // Also models the catalog did not select, as with the hand-written mappings before.
    byok.languageModel("acme/rocket-1");
    expect(seen).toEqual(["native-Anvil 2", "native-Rocket 1"]);
  });

  test("shares the bundled specs of a lab as soon as it is registered", () => {
    registerModels({
      namespace: "early",
      snapshot: { "early/m-1": { name: "M 1", providers: { early: { id: "native-m-1" } } } },
    });
    const provider = withCanonicalIds(new MockProviderV4(), { providerId: "early" });
    expect(getModelSpec(provider, "early/m-1")).toEqual({ id: "native-m-1" });
  });

  test("leaves the native IDs of custom models to the provider", () => {
    const seen: string[] = [];
    const base = new MockProviderV4();
    base.languageModel = (id: string) => {
      seen.push(id);
      return new MockLanguageModelV4({ modelId: id });
    };
    const a = withCanonicalIds(base, { mapping: { "acme/rocket-6": "rocket-six" } });
    createModelCatalog(
      defineModelCatalog({
        "acme/rocket-5": custom("Rocket 5", "2026-10-01"),
        "acme/rocket-6": custom("Rocket 6", "2026-11-01"),
      }),
      { a },
      offline,
    );

    expect(getModelSpecs(a)?.get("acme/rocket-5")).toEqual({});
    a.languageModel("acme/rocket-5");
    a.languageModel("acme/rocket-6");
    expect(seen).toEqual(["rocket-5", "rocket-six"]);
  });

  test("throws for a namespace no lab module registered", () => {
    expect(() => createModelCatalog(defineModelCatalog("nope/model"), providers, offline)).toThrow(
      "No models registered for 'nope'",
    );
  });

  test("throws when no model is served by a configured provider", () => {
    expect(() =>
      createModelCatalog(defineModelCatalog("acme/anvil-2"), { c: new MockProviderV4() }, offline),
    ).toThrow("No models configured");
  });

  test("does not fetch when only custom models are selected", async () => {
    const fetchSpy = spyOn(globalThis, "fetch");
    const only = { "custom/m": { providers: ["a"] } } satisfies Record<string, CatalogModel>;
    const store = createModelCatalog(defineModelCatalog(only), providers);

    expect(await store.load()).toEqual(only);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("live catalog", () => {
  const API: ModelsDevApi = {
    anthropic: {
      models: {
        "claude-live-9": {
          name: "Claude Live 9",
          family: "claude-live",
          release_date: "2027-01-01",
          modalities: { input: ["text"], output: ["text"] },
        },
      },
    },
  };

  const anthropic = { anthropic: new MockProviderV4() };

  let urls = 0;
  // The live catalog is shared per URL across the process, so every test gets its own.
  const source = () => ({ source: `https://catalog.test/${++urls}.json` });

  test("is loaded once, shared, and resolves groups against it", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(Response.json(API));
    const options = source();
    const spec = defineModelCatalog(claude.latest);

    const store = createModelCatalog(spec, anthropic, options);
    expect(store.current).toBeUndefined();

    const [a, b] = await Promise.all([store.load(), store.load()]);
    expect(a).toEqual({
      "anthropic/claude-live-9": {
        name: "Claude Live 9",
        family: "claude-live",
        created: "2027-01-01",
        modalities: { input: ["text"], output: ["text"] },
        providers: ["anthropic"],
      },
    });
    expect(b).toBe(a);
    expect(store.current).toBe(a);

    // Another gateway in the same process reuses the response.
    await createModelCatalog(spec, anthropic, options).load();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test("falls back to the bundled snapshot when loading fails", async () => {
    spyOn(globalThis, "fetch").mockResolvedValue(new Response("down", { status: 503 }));
    const spec = defineModelCatalog(claude["v4.x"]);

    const loaded = await createModelCatalog(spec, anthropic, source()).load();
    const bundled = createModelCatalog(spec, anthropic, offline).current;
    expect(Object.keys(loaded).length).toBeGreaterThan(0);
    expect(loaded).toEqual(bundled!);
  });

  test("falls back to the bundled snapshot when the payload has no usable model", async () => {
    spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ nope: true }));

    const loaded = await createModelCatalog(
      defineModelCatalog(claude.all),
      anthropic,
      source(),
    ).load();
    expect(Object.keys(loaded).length).toBeGreaterThan(0);
    expect(loaded["anthropic/claude-live-9"]).toBeUndefined();
  });

  test("the first request waits for it", async () => {
    spyOn(globalThis, "fetch").mockResolvedValue(Response.json(API));

    const endpoint = models({
      providers: anthropic,
      models: defineModelCatalog("anthropic/claude-live-*"),
      advanced: { catalog: source() },
    });

    const res = await endpoint.handler(new Request("http://localhost/models"));
    const body = (await res.json()) as { data: { id: string }[] };
    expect(body.data.map((m) => m.id)).toEqual(["anthropic/claude-live-9"]);
  });
});
