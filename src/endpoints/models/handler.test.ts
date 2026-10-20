import { describe, expect, test } from "bun:test";

import { MockProviderV4 } from "ai/test";

import { parseResponse } from "../../../test/helpers/http";
import { models } from "./handler";

const baseUrl = "http://localhost/models";

describe("Models Handler", () => {
  const endpoint = models({
    providers: {
      anthropic: new MockProviderV4(),
      google: new MockProviderV4(),
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
            modality: "text+image->text",
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
            modality: "text+video->text",
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
        modality: "text+image->text",
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
      },
      endpoints: [{ tag: "anthropic" }],
    });
  });

  describe("architecture.modality", () => {
    const modalityOf = async (modalities: {
      input: ("text" | "image" | "file" | "audio" | "video")[];
      output: ("text" | "image" | "audio" | "video" | "embeddings" | "transcription")[];
    }) => {
      const res = await models({
        providers: { openai: new MockProviderV4() },
        models: { "test/model": { modalities, providers: ["openai"] } },
      }).handler(new Request(`${baseUrl}/test/model`, { method: "GET" }));
      const data = (await parseResponse(res)) as { architecture: { modality?: string } };
      return data.architecture.modality;
    };

    test("joins all inputs and outputs", async () => {
      expect(
        await modalityOf({ input: ["text", "image", "file"], output: ["text", "image"] }),
      ).toBe("text+image+file->text+image");
    });

    test("describes embeddings models", async () => {
      expect(await modalityOf({ input: ["text"], output: ["embeddings"] })).toBe(
        "text->embeddings",
      );
    });

    test("describes transcription models", async () => {
      expect(await modalityOf({ input: ["audio"], output: ["transcription"] })).toBe(
        "audio->transcription",
      );
    });
  });

  test("should return 'Method Not Allowed' for POST request", async () => {
    const request = new Request(baseUrl, { method: "POST" });

    const res = await endpoint.handler(request);
    const data = await parseResponse(res);

    expect(data).toMatchObject({
      error: {
        code: "method_not_allowed",
        message: "Method Not Allowed",
        type: "invalid_request_error",
      },
    });
  });
});
