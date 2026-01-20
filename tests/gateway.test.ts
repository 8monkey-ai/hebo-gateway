import { describe, expect, it } from "bun:test";

import { gateway } from "../src/gateway";
import { createModelCatalog } from "../src/model-catalog";

const parseResponse = async (res: Response) => {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

describe("Unit: Hebo Gateway Core", () => {
  const testModels = createModelCatalog({
    "anthropic/claude-opus-4.5": {
      name: "Claude Opus 4.5",
      created: "2025-09-29T10:00:00.000Z",
      knowledge: "2025-07",
      modalities: {
        input: ["text", "image"],
        output: ["text"],
      },
      context: 200000,
      capabilities: ["reasoning", "tool_call"],
      providers: ["anthropic"],
    },
    "google/gemini-3-flash": {
      name: "Gemini 3 Flash",
      created: "2025-10-01T08:30:00.000Z",
      modalities: {
        input: ["text", "video"],
        output: ["text"],
      },
      context: 128000,
      providers: ["google"],
    },
  });

  const gw = gateway({ models: testModels });

  const testCases = [
    {
      name: "should list models via GET /models with realistic data (exact match)",
      request: new Request("http://localhost/models", { method: "GET" }),
      expected: {
        object: "list",
        data: [
          {
            id: "anthropic/claude-opus-4.5",
            object: "model",
            created: Math.floor(Date.parse("2025-09-29T10:00:00.000Z") / 1000),
            owned_by: "anthropic",
          },
          {
            id: "google/gemini-3-flash",
            object: "model",
            created: Math.floor(Date.parse("2025-10-01T08:30:00.000Z") / 1000),
            owned_by: "google",
          },
        ],
      },
    },
    {
      name: "should return 'Not Found' for unknown GET routes",
      request: new Request("http://localhost/unknown", { method: "GET" }),
      expected: "Not Found",
    },
    {
      name: "should return 'Not Found' for POST /models",
      request: new Request("http://localhost/models", { method: "POST" }),
      expected: "Not Found",
    },
  ];

  for (const { name, request, expected } of testCases) {
    it(name, async () => {
      const res = await gw.handler(request);
      const data = await parseResponse(res);
      expect(data).toEqual(expected);
    });
  }
});
