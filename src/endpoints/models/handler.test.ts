import { MockProviderV3 } from "ai/test";
import { describe, expect, test } from "bun:test";

import { parseResponse } from "../../../test/helpers/http";
import { models } from "./handler";

const baseUrl = "http://localhost/models";

describe("Models Handler", () => {
  const endpoint = models({
    providers: {
      anthropic: new MockProviderV3(),
      google: new MockProviderV3(),
    },
    models: {
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
    },
  });

  test("should list models via GET request with realistic data (exact match)", async () => {
    const request = new Request(baseUrl, { method: "GET" });

    const res = await endpoint.handler(request);
    const data = await parseResponse(res);

    expect(data).toEqual({
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
    });
  });

  test("should return a single model by ID", async () => {
    const request = new Request(`${baseUrl}/anthropic/claude-opus-4.5`, { method: "GET" });

    const res = await endpoint.handler(request);
    const data = await parseResponse(res);

    expect(data).toEqual({
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
    });
  });

  test("should return 'Method Not Allowed' for POST request", async () => {
    const request = new Request(baseUrl, { method: "POST" });

    const res = await endpoint.handler(request);
    const data = await parseResponse(res);

    expect(data).toEqual({
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "Method Not Allowed",
        param: "",
        type: "invalid_request_error",
      },
    });
  });
});
