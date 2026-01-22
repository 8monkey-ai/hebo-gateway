import { describe, expect, it, mock } from "bun:test";

import { gateway } from "../src/gateway";

const mockEmbedMany = mock(async (options: any) => {
  return {
    embeddings: options.values.map(() => [0.1, 0.2, 0.3]),
    usage: { promptTokens: 10, totalTokens: 10 },
  };
});

mock.module("ai", () => ({
  embedMany: mockEmbedMany,
}));

describe("Embeddings Endpoint", () => {
  const mockProviders = {
    embeddingModel: (modelId: string) => ({
      modelId,
      provider: "test-provider",
    }),
  } as any;

  const gw = gateway({
    providers: mockProviders,
  });

  const parseResponse = async (res: Response) => {
    try {
      return await res.json();
    } catch {
      return await res.text();
    }
  };

  const testCases = [
    {
      name: "should generate embeddings for a single string",
      request: new Request("http://localhost/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "test-provider:test-model",
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
        model: "test-provider:test-model",
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
          model: "test-provider:test-model",
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
        model: "test-provider:test-model",
        usage: {
          prompt_tokens: 10,
          total_tokens: 10,
        },
      },
    },
    {
      name: "should return 400 if input is missing",
      request: new Request("http://localhost/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "test-provider:test-model",
        }),
      }),
      expected: "Bad Request: Missing 'input' or 'model'",
    },
  ];

  for (const { name, request, expected } of testCases) {
    it(name, async () => {
      mockEmbedMany.mockClear();
      const res = await gw.handler(request);

      if (res.status === 400 && typeof expected === "string") {
        const text = await res.text();
        expect(text).toContain(expected);
        return;
      }

      expect(res.status).toBe(200);
      const data = await parseResponse(res);
      expect(data).toEqual(expected);
    });
  }
});
