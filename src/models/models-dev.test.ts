import { describe, expect, test } from "bun:test";

import { CANONICAL_PROVIDER_IDS } from "../providers/types.ts";
import { BUNDLED_MODEL_CATALOG } from "./catalog.ts";
import { fromModelsDev, type ModelsDevApi, type ModelsDevModel } from "./models-dev.ts";

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
      anthropic: { models: { "claude-x-1": chat({ name: "Claude X 1" }) } },
    };

    expect(fromModelsDev(api)).toEqual({
      "anthropic/claude-x-1": {
        name: "Claude X 1",
        created: "2026-02-03",
        knowledge: "2026-01",
        modalities: { input: ["text", "image", "file"], output: ["text"] },
        context: 200_000,
        capabilities: ["attachments", "reasoning", "tool_call", "structured_output"],
        providers: ["anthropic", "bedrock"],
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

    expect(fromModelsDev(api)["zhipuai/glm-9"]?.providers).toEqual([
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
    expect(catalog["voyageai/voyage-9"]?.providers).toEqual(["voyage"]);
    // Open weights can be served by anyone, so the lab is not assumed to.
    expect(catalog["openai/whisper-9"]).toBeUndefined();
  });

  test("matches listings without canonical ID by an unambiguous model name", () => {
    const api: ModelsDevApi = {
      openai: { models: { "gpt-x": chat() } },
      azure: { models: { "gpt-x": chat(), "model-router": chat() } },
    };

    const catalog = fromModelsDev(api);
    expect(catalog["openai/gpt-x"]?.providers).toEqual(["openai", "azure"]);
    expect(Object.keys(catalog)).toEqual(["openai/gpt-x"]);
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

describe("bundled snapshot", () => {
  test("only references gateway providers", () => {
    const known = new Set<string>(CANONICAL_PROVIDER_IDS);
    for (const [id, model] of Object.entries(BUNDLED_MODEL_CATALOG)) {
      expect(model!.providers.length, id).toBeGreaterThan(0);
      for (const provider of model!.providers) expect(known.has(provider), id).toBe(true);
    }
  });
});
