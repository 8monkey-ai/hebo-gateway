import { describe, expect, test } from "bun:test";

import { CANONICAL_PROVIDER_IDS } from "../providers/types.ts";
import { fromModelsDev, type ModelsDevApi, type ModelsDevModel } from "./models-dev.ts";
import type { ModelCatalog } from "./types.ts";

const SNAPSHOTS = new Bun.Glob("*/models-dev.json");

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

    expect(fromModelsDev(api)).toEqual({
      "anthropic/claude-x-1": {
        name: "Claude X 1",
        family: "claude-x",
        created: "2026-02-03",
        knowledge: "2026-01",
        modalities: { input: ["text", "image", "file"], output: ["text"] },
        context: 200_000,
        capabilities: ["attachments", "reasoning", "tool_call", "structured_output"],
        providers: { anthropic: "claude-x-1", bedrock: "anthropic.claude-x-1" },
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

    expect(Object.keys(fromModelsDev(api)["zhipuai/glm-9"]!.providers)).toEqual([
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

    expect(Object.keys(fromModelsDev(api))).toEqual(["openai/gpt-new"]);
  });

  test("skips models that no gateway provider serves", () => {
    const api: ModelsDevApi = {
      openrouter: { models: { "openai/gpt-x": chat({ canonical_model_id: "openai/gpt-x" }) } },
    };

    expect(fromModelsDev(api)).toEqual({});
  });

  test("maps specialized types and assigns closed-weight ones to their lab", () => {
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
            open_weights: true,
            canonical_model_id: "openai/whisper-9",
            modalities: { input: ["audio"], output: ["text"] },
          }),
        },
      },
    };

    const catalog = fromModelsDev(api);
    expect(catalog["voyageai/voyage-9"]?.modalities?.output).toEqual(["embeddings"]);
    expect(catalog["voyageai/voyage-9"]?.providers).toEqual({ voyage: "voyage-9" });
    // Open weights can be served by anyone, so the lab is not assumed to.
    expect(catalog["openai/whisper-9"]).toBeUndefined();
  });

  test("matches listings without canonical ID by an unambiguous model name", () => {
    const api: ModelsDevApi = {
      openai: { models: { "gpt-x": chat() } },
      azure: { models: { "gpt-x": chat(), "model-router": chat() } },
    };

    const catalog = fromModelsDev(api);
    expect(catalog["openai/gpt-x"]?.providers).toEqual({ openai: "gpt-x", azure: "gpt-x" });
    expect(Object.keys(catalog)).toEqual(["openai/gpt-x"]);
  });

  test("only reads the given namespaces", () => {
    const api: ModelsDevApi = {
      openai: { models: { "gpt-x": chat() } },
      anthropic: { models: { "claude-x": chat() } },
    };

    expect(Object.keys(fromModelsDev(api, ["anthropic"]))).toEqual(["anthropic/claude-x"]);
  });

  test("picks the native ID named like the model, and skips routers", () => {
    const api: ModelsDevApi = {
      minimax: { models: { "MiniMax-M9": chat(), "MiniMax-M9-highspeed": chat() } },
      "fireworks-ai": {
        models: {
          "accounts/fireworks/routers/minimax-latest": chat({
            canonical_model_id: "minimax/MiniMax-M9",
          }),
          "accounts/fireworks/models/minimax-m9": chat({
            canonical_model_id: "minimax/MiniMax-M9",
          }),
        },
      },
    };

    expect(fromModelsDev(api)["minimax/MiniMax-M9"]?.providers).toEqual({
      minimax: "MiniMax-M9",
      fireworks: "accounts/fireworks/models/minimax-m9",
    });
  });

  test("skips listings served through an SDK the adapter does not speak", () => {
    const api: ModelsDevApi = {
      anthropic: { models: { "claude-x": chat() } },
      azure: {
        models: { "claude-x": chat({ provider: { npm: "@ai-sdk/anthropic" } }) },
      },
    };

    expect(fromModelsDev(api)["anthropic/claude-x"]?.providers).toEqual({
      anthropic: "claude-x",
    });
  });

  test("collapses Bedrock inference profiles and marks Mantle models", () => {
    const bedrock = (id: string, model: ModelsDevModel = {}) => [
      id,
      chat({
        canonical_model_id: `openai/${id.split(".").at(-1)!.replace(/-1:0$/u, "")}`,
        ...model,
      }),
    ];
    const mantle = { provider: { npm: "@ai-sdk/amazon-bedrock/mantle" } };
    const api: ModelsDevApi = {
      "amazon-bedrock": {
        models: Object.fromEntries([
          // Converse on demand, and through a profile.
          bedrock("openai.gpt-a"),
          bedrock("us.openai.gpt-a"),
          // Profiles only.
          bedrock("global.openai.gpt-b"),
          // Mantle, its profiles are ignored.
          bedrock("openai.gpt-c", mantle),
          bedrock("us.openai.gpt-c"),
          // Converse wins over Mantle; a `us-gov` profile is no reason to use profiles.
          bedrock("openai.gpt-d", mantle),
          bedrock("openai.gpt-d-1:0"),
          bedrock("us-gov.openai.gpt-d-1:0"),
        ]) as Record<string, ModelsDevModel>,
      },
    };

    const providers = Object.entries(fromModelsDev(api)).map(([id, m]) => [id, m!.providers]);
    expect(Object.fromEntries(providers)).toEqual({
      "openai/gpt-a": { bedrock: "{ip?}openai.gpt-a" },
      "openai/gpt-b": { bedrock: "{ip}openai.gpt-b" },
      "openai/gpt-c": { bedrock: "mantle:openai.gpt-c" },
      "openai/gpt-d": { bedrock: "openai.gpt-d-1:0" },
    });
  });

  test("tolerates malformed payloads", () => {
    const api = {
      openai: { models: { a: null, b: "x" } },
      anthropic: null,
      xai: { models: 1 },
      constructor: { models: { x: chat({ canonical_model_id: "constructor/x" }) } },
    } as unknown as ModelsDevApi;

    expect(fromModelsDev(api)).toEqual({});
  });
});

describe("bundled snapshots", () => {
  test("only reference gateway providers", async () => {
    const known = new Set<string>(CANONICAL_PROVIDER_IDS);
    for await (const file of SNAPSHOTS.scan(import.meta.dir)) {
      const snapshot = (await Bun.file(`${import.meta.dir}/${file}`).json()) as ModelCatalog;
      for (const [id, model] of Object.entries(snapshot)) {
        const providers = Object.keys(model!.providers);
        expect(providers.length, id).toBeGreaterThan(0);
        for (const provider of providers) expect(known.has(provider), id).toBe(true);
      }
    }
  });
});
