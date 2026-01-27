import { createProviderRegistry } from "ai";
import { MockEmbeddingModelV3, MockProviderV3 } from "ai/test";
import { describe, expect, test } from "bun:test";

import { parseResponse, postJson } from "../../../test/helpers/http";
import { createModelCatalog } from "../../models/catalog";
import { embeddings } from "./handler";

const baseUrl = "http://localhost/embeddings";

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
          // eslint-disable-next-line require-await
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

  const endpoint = embeddings({ providers: registry, models: catalog });

  test("should return 400 if model does not support embeddings", async () => {
    const request = postJson(baseUrl, {
      model: "gpt-oss-20b",
      input: "hello world",
    });

    const res = await endpoint.handler(request);
    const data = await parseResponse(res);

    expect(data).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Model 'gpt-oss-20b' does not support 'embeddings' output",
        type: "invalid_request_error",
      },
    });
  });

  test("should generate embeddings for a single string", async () => {
    const request = postJson(baseUrl, {
      model: "text-embedding-3-small",
      input: "hello world",
    });

    const res = await endpoint.handler(request);
    const data = await parseResponse(res);

    expect(data).toEqual(expectedEmbeddingResponse(1));
  });

  test("should generate embeddings for an array of strings", async () => {
    const request = postJson(baseUrl, {
      model: "text-embedding-3-small",
      input: ["hello", "world"],
    });

    const res = await endpoint.handler(request);
    const data = await parseResponse(res);

    expect(data).toEqual(expectedEmbeddingResponse(2));
  });

  test("should return 422 if input is missing", async () => {
    const request = postJson(baseUrl, {
      model: "text-embedding-3-small",
    });

    const res = await endpoint.handler(request);
    const data = await parseResponse(res);

    expect(data).toEqual({
      error: {
        code: "UNPROCESSABLE_ENTITY",
        message: "Validation error",
        param: "✖ Invalid input\n  → at input",
        type: "invalid_request_error",
      },
    });
  });

  test("should return 'Method Not Allowed' for GET request", async () => {
    const request = new Request(baseUrl, { method: "GET" });

    const res = await endpoint.handler(request);
    const data = await parseResponse(res);

    expect(data).toEqual({
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "Method Not Allowed",
        type: "invalid_request_error",
      },
    });
  });
});
