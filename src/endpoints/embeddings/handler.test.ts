import { createProviderRegistry } from "ai";
import { MockEmbeddingModelV3, MockProviderV3 } from "ai/test";
import { describe, expect, it } from "bun:test";

import { createModelCatalog } from "../../models/catalog";
import { embeddings } from "./handler";

const parseResponse = async (res: Response) => {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const baseUrl = "http://localhost/embeddings";

const postJson = (body: unknown) =>
  new Request(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const expectedEmbeddingResponse = (count: number) => ({
  object: "list",
  data: Array.from({ length: count }, (_, index) => ({
    object: "embedding",
    embedding: [0.1, 0.2, 0.3],
    index,
  })),
  model: "text-embedding-3-small",
  usage: {
    prompt_tokens: count * 10,
    total_tokens: count * 10,
  },
  providerMetadata: {
    openai: {
      key: "value",
    },
  },
});

describe("Embeddings Handler", () => {
  const registry = createProviderRegistry({
    openai: new MockProviderV3({
      embeddingModels: {
        "text-embedding-3-small": new MockEmbeddingModelV3({
          doEmbed: async (options) => ({
            embeddings: options.values.map(() => [0.1, 0.2, 0.3]),
            usage: { tokens: 10 },
            providerMetadata: { openai: { key: "value" } },
            warnings: [],
          }),
        }),
      },
    }),
  });

  const catalog = createModelCatalog({
    "text-embedding-3-small": {
      name: "OpenAI Embedding Model",
      modalities: { input: ["text"], output: ["embeddings"] },
      providers: ["openai"],
    },
    "gpt-oss-20b": {
      name: "GPT-OSS 20B",
      modalities: { input: ["text"], output: ["text"] },
      providers: ["openai"],
    },
  });

  const endpoint = embeddings({ providers: registry, models: catalog }, true);

  it("should return 400 if model does not support embeddings", async () => {
    const request = postJson({
      model: "gpt-oss-20b",
      input: "hello world",
    });

    const res = await endpoint.handler(request);
    const data = await parseResponse(res);

    expect(data).toEqual({
      code: "BAD_REQUEST",
      message: "Model 'gpt-oss-20b' does not support 'embeddings' output",
    });
  });

  it("should generate embeddings for a single string", async () => {
    const request = postJson({
      model: "text-embedding-3-small",
      input: "hello world",
    });

    const res = await endpoint.handler(request);
    const data = await parseResponse(res);

    expect(data).toEqual(expectedEmbeddingResponse(1));
  });

  it("should generate embeddings for an array of strings", async () => {
    const request = postJson({
      model: "text-embedding-3-small",
      input: ["hello", "world"],
    });

    const res = await endpoint.handler(request);
    const data = await parseResponse(res);

    expect(data).toEqual(expectedEmbeddingResponse(2));
  });

  it("should return 422 if input is missing", async () => {
    const request = postJson({
      model: "text-embedding-3-small",
    });

    const res = await endpoint.handler(request);
    const data = await parseResponse(res);

    expect(data).toEqual({
      code: "UNPROCESSABLE_ENTITY",
      message: "Validation error",
      detail: "✖ Invalid input\n  → at input",
    });
  });

  it("should return 'Method Not Allowed' for GET request", async () => {
    const request = new Request(baseUrl, { method: "GET" });

    const res = await endpoint.handler(request);
    const data = await parseResponse(res);

    expect(data).toEqual({
      code: "METHOD_NOT_ALLOWED",
      message: "Method Not Allowed",
    });
  });
});
