import { describe, expect, it, mock } from "bun:test";

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

  const endpoint = embeddings(mockProviders);

  const testCases = [
    {
      name: "should generate embeddings for a single string",
      request: new Request("http://localhost/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "openai:text-embedding-3-small",
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
        model: "openai:text-embedding-3-small",
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
          model: "openai:text-embedding-3-small",
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
        model: "openai:text-embedding-3-small",
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
          model: "openai:text-embedding-3-small",
        }),
      }),
      expected: "Bad Request: Missing 'input' or 'model'",
    },
    {
      name: "should return 'Method Not Allowed' for GET request",
      request: new Request("http://localhost/embeddings", { method: "GET" }),
      expected: "Method Not Allowed",
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
});
