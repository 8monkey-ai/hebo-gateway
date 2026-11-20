import { describe, expect, test } from "bun:test";

// Provider adapters register the models.dev providers backing them when their ID differs.
// oxlint-disable no-unassigned-import
import "../providers/bedrock/canonical.ts";
import "../providers/fireworks/canonical.ts";
import "../providers/moonshot/canonical.ts";
import "../providers/vertex/canonical.ts";
// Registers every lab module.
import "../../test/helpers/catalog.ts";
// oxlint-enable no-unassigned-import
import { CANONICAL_PROVIDER_IDS } from "../providers/types.ts";
import { getRegisteredLabs } from "./catalog.ts";
import {
  fromModelsDev,
  type ModelsDevApi,
  type ModelsDevLab,
  type ModelsDevModel,
  registerModelsDevHosts,
} from "./models-dev.ts";
import type { ModelsDevCatalog, ModelSpecs } from "./types.ts";

const SNAPSHOTS = new Bun.Glob("*/models-dev.json");

// Labs as registered by their lab modules.
const LABS: ModelsDevLab[] = [
  { namespace: "anthropic", provider: "anthropic" },
  { namespace: "minimax", provider: "minimax" },
  { namespace: "openai", provider: "openai" },
  { namespace: "voyageai", provider: "voyage" },
  { namespace: "zhipuai", provider: "zai", host: "zai" },
];

const convert = (api: ModelsDevApi, labs = LABS) => fromModelsDev(api, labs);

/** Native ID of each provider. */
const nativeIds = (providers: ModelSpecs | undefined) =>
  providers &&
  Object.fromEntries(Object.entries(providers).map(([provider, spec]) => [provider, spec!.id]));

const chat = (overrides: ModelsDevModel = {}): ModelsDevModel => ({
  name: "Model",
  attachment: true,
  reasoning: true,
  tool_call: true,
  structured_output: true,
  temperature: false,
  knowledge: "2026-01",
  release_date: "2026-02-03",
  modalities: { input: ["text", "image", "pdf"], output: ["text"] },
  limit: { context: 200_000 },
  ...overrides,
});

describe("fromModelsDev", () => {
  test("keys models by canonical ID and maps their metadata", () => {
    const api: ModelsDevApi = {
      "amazon-bedrock": {
        models: {
          "anthropic.claude-x-1": chat({ canonical_model_id: "anthropic/claude-x-1" }),
        },
      },
      // First-party listings often omit `canonical_model_id`.
      anthropic: { models: { "claude-x-1": chat({ name: "Claude X 1", family: "claude-x" }) } },
    };

    expect(convert(api)).toEqual({
      "anthropic/claude-x-1": {
        name: "Claude X 1",
        family: "claude-x",
        created: "2026-02-03",
        knowledge: "2026-01",
        modalities: { input: ["text", "image", "file"], output: ["text"] },
        context: 200_000,
        capabilities: ["attachments", "reasoning", "tool_call", "structured_output"],
        providers: { anthropic: { id: "claude-x-1" }, bedrock: { id: "anthropic.claude-x-1" } },
      },
    });
  });

  test("lists the lab's own provider first, then the others in preference order", () => {
    const listing = { models: { m: chat({ canonical_model_id: "zhipuai/glm-9" }) } };
    const api: ModelsDevApi = {
      chutes: listing,
      "fireworks-ai": listing,
      "amazon-bedrock": listing,
      zai: { models: { "glm-9": chat() } },
    };

    expect(Object.keys(convert(api)["zhipuai/glm-9"]!.providers)).toEqual([
      "zai",
      "bedrock",
      "fireworks",
      "chutes",
    ]);
  });

  test("ignores deprecated listings, unsupported types and unknown labs", () => {
    const api: ModelsDevApi = {
      openai: {
        models: {
          "gpt-old": chat({ status: "deprecated" }),
          "gpt-image": chat({ type: "image", modalities: { input: ["text"], output: ["image"] } }),
          "gpt-new": chat(),
        },
      },
      deepinfra: { models: { "acme/x": chat({ canonical_model_id: "acme/x" }) } },
    };

    expect(Object.keys(convert(api))).toEqual(["openai/gpt-new"]);
  });

  test("maps models.dev providers to gateway providers of the same ID, or registered by their adapter", () => {
    const listing = { models: { m: chat({ canonical_model_id: "zhipuai/glm-9" }) } };
    registerModelsDevHosts("acme-cloud", { "acme-ai": { sdks: ["@acme/sdk"] } });
    const api: ModelsDevApi = {
      groq: listing,
      "acme-ai": {
        models: {
          m: chat({ canonical_model_id: "zhipuai/glm-9", provider: { npm: "@acme/sdk" } }),
        },
      },
      "acme-other": listing,
    };

    // Canonical providers first, then the others.
    expect(nativeIds(convert(api)["zhipuai/glm-9"]?.providers)).toEqual({
      groq: "m",
      "acme-cloud": "m",
    });
  });

  test("skips models that no gateway provider serves", () => {
    const api: ModelsDevApi = {
      openrouter: { models: { "openai/gpt-x": chat({ canonical_model_id: "openai/gpt-x" }) } },
    };

    expect(convert(api)).toEqual({});
  });

  test("maps specialized types, kept without a gateway provider only when lab extras name one", () => {
    const api: ModelsDevApi = {
      vercel: {
        models: {
          "voyage/voyage-9": chat({
            type: "embedding",
            canonical_model_id: "voyageai/voyage-9",
            modalities: { input: ["text"], output: ["text"] },
          }),
          "openai/whisper-9": chat({
            type: "transcription",
            canonical_model_id: "openai/whisper-9",
            modalities: { input: ["audio"], output: ["text"] },
          }),
        },
      },
    };
    const labs = LABS.map((lab) =>
      lab.namespace === "voyageai"
        ? { ...lab, extras: { "voyageai/voyage-9": { providers: { voyage: {} } } } }
        : lab,
    );

    const catalog = convert(api, labs);
    expect(catalog["voyageai/voyage-9"]?.modalities?.output).toEqual(["embeddings"]);
    // No listing is invented for the lab: its extras fill it in when the catalog loads.
    expect(catalog["voyageai/voyage-9"]?.providers).toEqual({});
    expect(catalog["openai/whisper-9"]).toBeUndefined();
  });

  test("skips listings whose native ID is not a plain ID", () => {
    const listing = (ids: string[]) => ({
      models: Object.fromEntries(
        ids.map((id) => [id, chat({ canonical_model_id: "openai/gpt-x" })]),
      ),
    });
    const api: ModelsDevApi = {
      groq: listing(["../../v1/files", "gpt-x?alt=1"]),
      deepinfra: listing(["openai/gpt-x"]),
    };

    expect(convert(api)["openai/gpt-x"]?.providers).toEqual({
      deepinfra: { id: "openai/gpt-x" },
    });
  });

  test("matches listings without canonical ID by an unambiguous model name", () => {
    const api: ModelsDevApi = {
      openai: { models: { "gpt-x": chat() } },
      azure: { models: { "gpt-x": chat(), "model-router": chat() } },
    };

    const catalog = convert(api);
    expect(nativeIds(catalog["openai/gpt-x"]?.providers)).toEqual({
      openai: "gpt-x",
      azure: "gpt-x",
    });
    expect(Object.keys(catalog)).toEqual(["openai/gpt-x"]);
  });

  test("only reads the given namespaces", () => {
    const api: ModelsDevApi = {
      openai: { models: { "gpt-x": chat() } },
      anthropic: { models: { "claude-x": chat() } },
    };

    const anthropic = LABS.filter((lab) => lab.namespace === "anthropic");
    expect(Object.keys(convert(api, anthropic))).toEqual(["anthropic/claude-x"]);
  });

  test("reads a lab's own listing from its models.dev provider", () => {
    const api: ModelsDevApi = { zai: { models: { "glm-9": chat() } } };

    expect(nativeIds(convert(api)["zhipuai/glm-9"]?.providers)).toEqual({ zai: "glm-9" });
  });

  test("leaves a name shared with a lab that is not registered unmatched", () => {
    const api: ModelsDevApi = {
      openai: { models: { "x-1": chat() } },
      // `acme` is a namespace on models.dev, so its own listing counts as first-party.
      acme: { models: { "x-1": chat() } },
      deepinfra: { models: { "acme/x-2": chat({ canonical_model_id: "acme/x-2" }) } },
      azure: { models: { "x-1": chat() } },
    };

    expect(nativeIds(convert(api)["openai/x-1"]?.providers)).toEqual({ openai: "x-1" });
  });

  test("picks the native ID named like the model", () => {
    const api: ModelsDevApi = {
      minimax: { models: { "MiniMax-M9-highspeed": chat(), "MiniMax-M9": chat() } },
    };

    expect(nativeIds(convert(api)["minimax/MiniMax-M9"]?.providers)).toEqual({
      minimax: "MiniMax-M9",
    });
  });

  test("lets a provider adapter pick the listing and add spec fields", () => {
    registerModelsDevHosts("acme-cloud", {
      "acme-picky": {
        pick: (_id, listings) => {
          const listing = listings.find(({ nativeId }) => nativeId.endsWith("-b"));
          return listing && { ...listing, spec: { output: 1 } };
        },
      },
    });
    const api: ModelsDevApi = {
      "acme-picky": {
        models: {
          "gpt-x-a": chat({ canonical_model_id: "openai/gpt-x" }),
          "gpt-x-b": chat({ canonical_model_id: "openai/gpt-x" }),
        },
      },
    };

    expect(convert(api)["openai/gpt-x"]?.providers).toEqual({
      "acme-cloud": { id: "gpt-x-b", output: 1 },
    });
  });

  test("skips listings served through an SDK the adapter does not speak", () => {
    const api: ModelsDevApi = {
      anthropic: { models: { "claude-x": chat() } },
      azure: {
        models: { "claude-x": chat({ provider: { npm: "@ai-sdk/anthropic" } }) },
      },
    };

    expect(nativeIds(convert(api)["anthropic/claude-x"]?.providers)).toEqual({
      anthropic: "claude-x",
    });
  });

  test("keeps the output limit and reasoning controls of each provider's listing", () => {
    const api: ModelsDevApi = {
      anthropic: {
        models: {
          "claude-x": chat({
            limit: { context: 200_000, output: 64_000 },
            reasoning_options: [
              { type: "effort", values: ["default", "max", "low", "high"] },
              { type: "budget_tokens", min: 1024 },
            ],
          }),
          "claude-y": chat({ reasoning: false, reasoning_options: null }),
        },
      },
      "amazon-bedrock": {
        models: {
          "anthropic.claude-x": chat({
            canonical_model_id: "anthropic/claude-x",
            reasoning_options: [{ type: "toggle" }],
          }),
          // Reasons, but takes no control at all.
          "anthropic.claude-y": chat({
            canonical_model_id: "anthropic/claude-y",
            reasoning_options: [],
          }),
        },
      },
      // Unknown controls.
      azure: { models: { "claude-x": chat({ canonical_model_id: "anthropic/claude-x" }) } },
    };

    const catalog = convert(api);
    expect(catalog["anthropic/claude-x"]?.providers).toEqual({
      anthropic: {
        id: "claude-x",
        output: 64_000,
        reasoning: { effort: ["low", "high", "max"], budget: { min: 1024 } },
      },
      bedrock: { id: "anthropic.claude-x", reasoning: { toggle: true } },
      azure: { id: "claude-x" },
    });
    expect(catalog["anthropic/claude-y"]?.providers).toEqual({
      anthropic: { id: "claude-y", reasoning: false },
      bedrock: { id: "anthropic.claude-y", reasoning: {} },
    });
  });

  test("leaves out the models a lab excludes", () => {
    const api: ModelsDevApi = {
      anthropic: { models: { "claude-x-4-5": chat(), "claude-x-4-6": chat() } },
    };
    const labs = [{ namespace: "anthropic", provider: "anthropic", exclude: ["claude-*-4-5*"] }];
    expect(Object.keys(convert(api, labs as ModelsDevLab[]))).toEqual(["anthropic/claude-x-4-6"]);
  });

  test("tolerates malformed payloads", () => {
    const api = {
      openai: { models: { a: null, b: "x" } },
      anthropic: null,
      xai: { models: 1 },
      constructor: { models: { x: chat({ canonical_model_id: "constructor/x" }) } },
    } as unknown as ModelsDevApi;

    expect(convert(api)).toEqual({});
  });
});

describe("bundled snapshots", () => {
  test("only reference gateway providers, or lab extras fill them in", async () => {
    const known = new Set<string>(CANONICAL_PROVIDER_IDS);
    for await (const file of SNAPSHOTS.scan(import.meta.dir)) {
      const snapshot = (await Bun.file(`${import.meta.dir}/${file}`).json()) as ModelsDevCatalog;
      for (const [id, model] of Object.entries(snapshot)) {
        const providers = Object.keys(model!.providers);
        if (providers.length === 0) {
          const labs = [...getRegisteredLabs().values()];
          expect(
            labs.some((lab) => lab.extras?.[id]),
            id,
          ).toBe(true);
        }
        for (const provider of providers) expect(known.has(provider), id).toBe(true);
      }
    }
  });
});
