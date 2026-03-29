import { describe, expect, test } from "bun:test";

import type { Responses, ResponsesBody } from "./schema";

import { getResponsesRequestAttributes, getResponsesResponseAttributes } from "./otel";

describe("Responses OTEL", () => {
  test("should map request metadata into per-key attributes", () => {
    const body: ResponsesBody = {
      model: "openai/gpt-5",
      input: "hi",
      metadata: { tenant: "acme", "Org ID": "o-123" },
    };

    const attrs = getResponsesRequestAttributes(body, "recommended");

    expect(attrs["gen_ai.request.metadata"]).toBeUndefined();
    expect(attrs["gen_ai.request.metadata.tenant"]).toBe("acme");
    expect(attrs["gen_ai.request.metadata.Org ID"]).toBe("o-123");
  });

  test("should map string input to user message in full mode", () => {
    const body: ResponsesBody = {
      model: "openai/gpt-5",
      input: "Hello world",
    };

    const attrs = getResponsesRequestAttributes(body, "full");

    expect(attrs["gen_ai.input.messages"]).toEqual([
      JSON.stringify({
        role: "user",
        parts: [{ type: "text", content: "Hello world" }],
      }),
    ]);
  });

  test("should map multimodal input content parts to schema-compatible parts", () => {
    const body: ResponsesBody = {
      model: "openai/gpt-5",
      input: [
        {
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text: "What is in this image and audio?" },
            { type: "input_image", image_url: "https://example.com/cat.png" },
            { type: "input_image", image_url: "data:image/png;base64,AAAA" },
            { type: "input_audio", input_audio: { data: "AAAA", format: "wav" } },
            {
              type: "input_file",
              file_data: "AAAA",
              filename: "brochure.pdf",
            },
          ],
        },
      ],
    };

    const attrs = getResponsesRequestAttributes(body, "full");

    expect(attrs["gen_ai.input.messages"]).toEqual([
      JSON.stringify({
        role: "user",
        parts: [
          { type: "text", content: "What is in this image and audio?" },
          { type: "uri", modality: "image", uri: "https://example.com/cat.png" },
          {
            type: "blob",
            modality: "image",
            content: "[REDACTED_BINARY_DATA]",
            mime_type: "image/png",
          },
          {
            type: "blob",
            modality: "audio",
            content: "[REDACTED_BINARY_DATA]",
            mime_type: "audio/wav",
          },
          {
            type: "blob",
            modality: "file",
            content: "[REDACTED_BINARY_DATA]",
          },
        ],
      }),
    ]);
  });

  test("should include instructions as system message in full mode", () => {
    const body: ResponsesBody = {
      model: "openai/gpt-5",
      input: "Hi",
      instructions: "You are helpful.",
    };

    const attrs = getResponsesRequestAttributes(body, "full");

    const messages = attrs["gen_ai.input.messages"] as string[];
    expect(messages[0]).toBe(
      JSON.stringify({
        role: "system",
        parts: [{ type: "text", content: "You are helpful." }],
      }),
    );
    expect(messages[1]).toBe(
      JSON.stringify({
        role: "user",
        parts: [{ type: "text", content: "Hi" }],
      }),
    );
  });

  test("should stringify tool definitions in full mode", () => {
    const tool = {
      type: "function" as const,
      name: "get_weather",
      parameters: {
        type: "object",
        properties: { location: { type: "string" } },
      },
    };

    const body: ResponsesBody = {
      model: "openai/gpt-5",
      input: "hi",
      tools: [tool],
    };

    const attrs = getResponsesRequestAttributes(body, "full");

    expect(attrs["gen_ai.tool.definitions"]).toEqual([JSON.stringify(tool)]);
  });

  test("should map request parameters in recommended mode", () => {
    const body: ResponsesBody = {
      model: "openai/gpt-5",
      input: "hi",
      stream: true,
      temperature: 0.7,
      top_p: 0.9,
      max_output_tokens: 500,
      frequency_penalty: 0.5,
      presence_penalty: -0.5,
      service_tier: "priority",
    };

    const attrs = getResponsesRequestAttributes(body, "recommended");

    expect(attrs["gen_ai.request.stream"]).toBe(true);
    expect(attrs["gen_ai.request.temperature"]).toBe(0.7);
    expect(attrs["gen_ai.request.top_p"]).toBe(0.9);
    expect(attrs["gen_ai.request.max_tokens"]).toBe(500);
    expect(attrs["gen_ai.request.frequency_penalty"]).toBe(0.5);
    expect(attrs["gen_ai.request.presence_penalty"]).toBe(-0.5);
    expect(attrs["gen_ai.request.service_tier"]).toBe("priority");
  });

  test("should return empty for off signal level", () => {
    const body: ResponsesBody = {
      model: "openai/gpt-5",
      input: "hi",
    };

    const attrs = getResponsesRequestAttributes(body, "off");
    expect(attrs).toEqual({});
  });

  test("should map response attributes in recommended mode", () => {
    const response: Responses = {
      id: "018e69ba-a82d-7fb4-9c5d-010b9a89c836",
      object: "response",
      status: "completed",
      model: "openai/gpt-5",
      output: [
        {
          type: "message",
          id: "msg_1",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: "Hello" }],
        },
      ],
      usage: {
        input_tokens: 10,
        output_tokens: 20,
        total_tokens: 30,
        input_tokens_details: { cached_tokens: 4 },
        output_tokens_details: { reasoning_tokens: 6 },
      },
      created_at: 1700000000,
      completed_at: 1700000001,
      service_tier: "default",
    };

    const attrs = getResponsesResponseAttributes(response, "recommended", "stop");

    expect(attrs["gen_ai.response.id"]).toBe("018e69ba-a82d-7fb4-9c5d-010b9a89c836");
    expect(attrs["gen_ai.response.finish_reasons"]).toEqual(["stop"]);
    expect(attrs["gen_ai.usage.input_tokens"]).toBe(10);
    expect(attrs["gen_ai.usage.output_tokens"]).toBe(20);
    expect(attrs["gen_ai.usage.total_tokens"]).toBe(30);
    expect(attrs["gen_ai.usage.cache_read.input_tokens"]).toBe(4);
    expect(attrs["gen_ai.usage.reasoning.output_tokens"]).toBe(6);
  });

  test("should use responses.status if finishReason is not provided", () => {
    const response: Responses = {
      id: "018e69ba-a82d-7fb4-9c5d-010b9a89c836",
      object: "response",
      status: "completed",
      model: "openai/gpt-5",
      output: [],
      usage: null,
      created_at: 1700000000,
      completed_at: 1700000001,
    };

    const attrs = getResponsesResponseAttributes(response, "recommended");
    expect(attrs["gen_ai.response.finish_reasons"]).toEqual(["completed"]);
  });

  test("should map output messages in full mode", () => {
    const response: Responses = {
      id: "018e69ba-a82d-7fb4-9c5d-010b9a89c836",
      object: "response",
      status: "completed",
      model: "openai/gpt-5",
      output: [
        {
          type: "message",
          id: "msg_1",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: "Hi there" }],
        },
      ],
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        total_tokens: 15,
      },
      created_at: 1700000000,
      completed_at: 1700000001,
    };

    const attrs = getResponsesResponseAttributes(response, "full");

    expect(attrs["gen_ai.output.messages"]).toEqual([
      JSON.stringify({
        type: "message",
        status: "completed",
        role: "assistant",
        parts: [{ type: "text", content: "Hi there" }],
      }),
    ]);
  });
});
