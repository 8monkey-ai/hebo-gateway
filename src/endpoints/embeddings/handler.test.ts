import { describe, expect, it, mock } from "bun:test";

import { createModelCatalog } from "../../models/catalog";
import { embeddings } from "./handler";

const mockEmbedMany = mock((options: any) => {
  return {
    embeddings: options.values.map(() => [0.1, 0.2, 0.3]),
    usage: { tokens: 10 },
  };
});

mock.module("ai", () => ({
  embedMany: mockEmbedMany,
}));

const parseResponse = async (res: Response) => {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

describe("Embeddings Handler", () => {
  const mockProviders = {
    embeddingModel: (modelId: string) => ({
      modelId,
      provider: modelId.split(":")[0],
    }),
  } as any;

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

  const endpoint = embeddings({ providers: mockProviders, models: catalog });

  const testCases = [
    {
      name: "should return 400 if model does not support embeddings",
      request: new Request("http://localhost/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-oss-20b",
          input: "hello world",
        }),
      }),
      expected: {
        code: "BAD_REQUEST",
        message: "Model 'gpt-oss-20b' does not support 'embeddings' output",
      },
    },
    {
      name: "should generate embeddings for a single string",
      request: new Request("http://localhost/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: "hello world",
        }),
      }),
      expected: {
        object: "list",
        data: [
          {
            object: "embedding",
            embedding: [0.1, 0.2, 0.3],
            index: 0,
          },
        ],
        model: "text-embedding-3-small",
        usage: {
          prompt_tokens: 10,
          total_tokens: 10,
        },
      },
    },
    {
      name: "should generate embeddings for an array of strings",
      request: new Request("http://localhost/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: ["hello", "world"],
        }),
      }),
      expected: {
        object: "list",
        data: [
          {
            object: "embedding",
            embedding: [0.1, 0.2, 0.3],
            index: 0,
          },
          {
            object: "embedding",
            embedding: [0.1, 0.2, 0.3],
            index: 1,
          },
        ],
        model: "text-embedding-3-small",
        usage: {
          prompt_tokens: 10,
          total_tokens: 10,
        },
      },
    },
    {
      name: "should return 422 if input is missing",
      request: new Request("http://localhost/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "text-embedding-3-small",
        }),
      }),
      expected: {
        code: "UNPROCESSABLE_ENTITY",
        message: "Validation error",
        detail: "✖ Invalid input\n  → at input",
      },
    },
    {
      name: "should return 'Method Not Allowed' for GET request",
      request: new Request("http://localhost/embeddings", { method: "GET" }),
      expected: {
        code: "METHOD_NOT_ALLOWED",
        message: "Method Not Allowed",
      },
    },
  ];

  for (const { name, request, expected } of testCases) {
    it(name, async () => {
      mockEmbedMany.mockClear();
      const res = await endpoint.handler(request);
      const data = await parseResponse(res);
      expect(data).toEqual(expected);
    });
  }

  it("should pass through provider_metadata", async () => {
    mockEmbedMany.mockImplementationOnce((options: any) => {
      return {
        embeddings: options.values.map(() => [0.1, 0.2, 0.3]),
        usage: { tokens: 10 },
        providerMetadata: { custom: "metadata" },
      };
    });

    const request = new Request("http://localhost/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: "hello world",
      }),
    });

    const res = await endpoint.handler(request);
    const data = await parseResponse(res);
    expect(data.providerMetadata).toEqual({ custom: "metadata" });
  });
});
