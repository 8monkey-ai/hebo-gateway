import { gateway, createModelCatalog } from "#/";
import { describe, expect, it } from "bun:test";

const parseResponse = async (res: Response) => {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

describe("Hebo Gateway", () => {
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
            name: "Claude Opus 4.5",
            knowledge: "2025-07",
            context: 200000,
            capabilities: ["reasoning", "tool_call"],
            architecture: {
              modality: "text->text",
              input_modalities: ["text", "image"],
              output_modalities: ["text"],
            },
            endpoints: [{ tag: "anthropic" }],
          },
          {
            id: "google/gemini-3-flash",
            object: "model",
            created: Math.floor(Date.parse("2025-10-01T08:30:00.000Z") / 1000),
            owned_by: "google",
            name: "Gemini 3 Flash",
            context: 128000,
            architecture: {
              modality: "text->text",
              input_modalities: ["text", "video"],
              output_modalities: ["text"],
            },
            endpoints: [{ tag: "google" }],
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
      name: "should return 'Method Not Allowed' for POST /models",
      request: new Request("http://localhost/models", { method: "POST" }),
      expected: "Method Not Allowed",
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

describe("Hebo Gateway with Base Path", () => {
  const testModels = createModelCatalog({});
  const gw = gateway({ models: testModels, basePath: "/api/v1" });

  it("should route correctly with base path", async () => {
    const req = new Request("http://localhost/api/v1/models", { method: "GET" });
    const res = await gw.handler(req);
    expect(res.status).toBe(200);
  });

  it("should return 404 for path without base path", async () => {
    const req = new Request("http://localhost/models", { method: "GET" });
    const res = await gw.handler(req);
    expect(res.status).toBe(404);
  });
});
