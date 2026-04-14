import { describe, expect, test } from "bun:test";

import { getMessagesRequestAttributes, getMessagesResponseAttributes } from "./otel";
import type { Messages, MessagesBody } from "./schema";

describe("Messages OTEL", () => {
  test("should return empty for off signal level", () => {
    const body: MessagesBody = {
      model: "anthropic/claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: "user", content: "hi" }],
    };

    const attrs = getMessagesRequestAttributes(body, "off");
    expect(attrs).toEqual({});
  });

  test("should return empty when signalLevel is undefined", () => {
    const body: MessagesBody = {
      model: "anthropic/claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: "user", content: "hi" }],
    };

    const attrs = getMessagesRequestAttributes(body);
    expect(attrs).toEqual({});
  });

  test("should map request parameters in recommended mode", () => {
    const body: MessagesBody = {
      model: "anthropic/claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [{ role: "user", content: "hi" }],
      stream: true,
      temperature: 0.7,
      top_p: 0.9,
      service_tier: "auto",
    };

    const attrs = getMessagesRequestAttributes(body, "recommended");

    expect(attrs["gen_ai.request.stream"]).toBe(true);
    expect(attrs["gen_ai.request.max_tokens"]).toBe(500);
    expect(attrs["gen_ai.request.temperature"]).toBe(0.7);
    expect(attrs["gen_ai.request.top_p"]).toBe(0.9);
    expect(attrs["gen_ai.request.service_tier"]).toBe("auto");
  });

  test("should map request metadata into per-key attributes", () => {
    const body: MessagesBody = {
      model: "anthropic/claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: "user", content: "hi" }],
      metadata: { user_id: "user-123" },
    };

    const attrs = getMessagesRequestAttributes(body, "recommended");

    expect(attrs["gen_ai.request.metadata"]).toBeUndefined();
    expect(attrs["gen_ai.request.metadata.user_id"]).toBe("user-123");
  });

  test("should map string input to user message in full mode", () => {
    const body: MessagesBody = {
      model: "anthropic/claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: "user", content: "Hello world" }],
    };

    const attrs = getMessagesRequestAttributes(body, "full");

    expect(attrs["gen_ai.input.messages"]).toEqual([
      JSON.stringify({
        role: "user",
        parts: [{ type: "text", content: "Hello world" }],
      }),
    ]);
  });

  test("should include system prompt string as system message in full mode", () => {
    const body: MessagesBody = {
      model: "anthropic/claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: "user", content: "Hi" }],
      system: "You are helpful.",
    };

    const attrs = getMessagesRequestAttributes(body, "full");

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

  test("should include system prompt blocks as system message in full mode", () => {
    const body: MessagesBody = {
      model: "anthropic/claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: "user", content: "Hi" }],
      system: [
        { type: "text" as const, text: "You are " },
        { type: "text" as const, text: "helpful." },
      ],
    };

    const attrs = getMessagesRequestAttributes(body, "full");

    const messages = attrs["gen_ai.input.messages"] as string[];
    expect(messages[0]).toBe(
      JSON.stringify({
        role: "system",
        parts: [{ type: "text", content: "You are helpful." }],
      }),
    );
  });

  test("should stringify tool definitions in full mode", () => {
    const tool = {
      name: "get_weather",
      description: "Get weather for a location",
      input_schema: {
        type: "object",
        properties: { location: { type: "string" } },
      },
    };

    const body: MessagesBody = {
      model: "anthropic/claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: "user", content: "hi" }],
      tools: [tool],
    };

    const attrs = getMessagesRequestAttributes(body, "full");

    expect(attrs["gen_ai.tool.definitions"]).toEqual([JSON.stringify(tool)]);
  });

  test("should map user content blocks with image and document parts in full mode", () => {
    const body: MessagesBody = {
      model: "anthropic/claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What is in this image?" },
            {
              type: "image",
              source: { type: "base64", media_type: "image/png", data: "AAAA" },
            },
            {
              type: "image",
              source: { type: "url", url: "https://example.com/cat.png" },
            },
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: "AAAA" },
            },
          ],
        },
      ],
    };

    const attrs = getMessagesRequestAttributes(body, "full");

    expect(attrs["gen_ai.input.messages"]).toEqual([
      JSON.stringify({
        role: "user",
        parts: [
          { type: "text", content: "What is in this image?" },
          {
            type: "blob",
            modality: "image",
            content: "[REDACTED_BINARY_DATA]",
            mime_type: "image/png",
          },
          { type: "uri", modality: "image", uri: "https://example.com/cat.png" },
          {
            type: "blob",
            modality: "file",
            content: "[REDACTED_BINARY_DATA]",
            mime_type: "application/pdf",
          },
        ],
      }),
    ]);
  });

  test("should map tool_result content block in full mode", () => {
    const body: MessagesBody = {
      model: "anthropic/claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tool_1",
              content: "The weather is sunny.",
            },
          ],
        },
      ],
    };

    const attrs = getMessagesRequestAttributes(body, "full");

    expect(attrs["gen_ai.input.messages"]).toEqual([
      JSON.stringify({
        role: "user",
        parts: [
          {
            type: "tool_call_response",
            id: "tool_1",
            response: "The weather is sunny.",
          },
        ],
      }),
    ]);
  });

  test("should map assistant message with tool_use and thinking blocks in full mode", () => {
    const body: MessagesBody = {
      model: "anthropic/claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        { role: "user", content: "hi" },
        {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "Let me think...", signature: "sig" },
            { type: "redacted_thinking", data: "encrypted" },
            { type: "text", text: "Hello!" },
            {
              type: "tool_use",
              id: "tool_1",
              name: "get_weather",
              input: { location: "NYC" },
            },
          ],
        },
      ],
    };

    const attrs = getMessagesRequestAttributes(body, "full");

    const messages = attrs["gen_ai.input.messages"] as string[];
    expect(messages[1]).toBe(
      JSON.stringify({
        role: "assistant",
        parts: [
          { type: "reasoning", content: "Let me think..." },
          { type: "reasoning", content: "[ENCRYPTED_REASONING]" },
          { type: "text", content: "Hello!" },
          {
            type: "tool_call",
            id: "tool_1",
            name: "get_weather",
            arguments: '{"location":"NYC"}',
          },
        ],
      }),
    );
  });

  // --- Response attributes ---

  test("should return empty response attributes for off signal level", () => {
    const response: Messages = {
      id: "msg_123",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "Hello" }],
      model: "anthropic/claude-sonnet-4-20250514",
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    };

    const attrs = getMessagesResponseAttributes(response, "off");
    expect(attrs).toEqual({});
  });

  test("should return empty response attributes when signalLevel is undefined", () => {
    const response: Messages = {
      id: "msg_123",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "Hello" }],
      model: "anthropic/claude-sonnet-4-20250514",
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    };

    const attrs = getMessagesResponseAttributes(response);
    expect(attrs).toEqual({});
  });

  test("should return response.id at required level", () => {
    const response: Messages = {
      id: "msg_123",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "Hello" }],
      model: "anthropic/claude-sonnet-4-20250514",
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    };

    const attrs = getMessagesResponseAttributes(response, "required");

    expect(attrs["gen_ai.response.id"]).toBe("msg_123");
    expect(attrs["gen_ai.response.finish_reasons"]).toBeUndefined();
    expect(attrs["gen_ai.usage.input_tokens"]).toBeUndefined();
  });

  test("should map response attributes in recommended mode", () => {
    const response: Messages = {
      id: "msg_123",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "Hello" }],
      model: "anthropic/claude-sonnet-4-20250514",
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: {
        input_tokens: 10,
        output_tokens: 20,
        cache_read_input_tokens: 4,
        cache_creation_input_tokens: 2,
      },
      service_tier: "standard_only",
    };

    const attrs = getMessagesResponseAttributes(response, "recommended", "stop");

    expect(attrs["gen_ai.response.id"]).toBe("msg_123");
    expect(attrs["gen_ai.response.finish_reasons"]).toEqual(["stop"]);
    expect(attrs["gen_ai.response.service_tier"]).toBe("standard_only");
    expect(attrs["gen_ai.usage.input_tokens"]).toBe(10);
    expect(attrs["gen_ai.usage.output_tokens"]).toBe(20);
    expect(attrs["gen_ai.usage.cache_read.input_tokens"]).toBe(4);
    expect(attrs["gen_ai.usage.cache_creation.input_tokens"]).toBe(2);
  });

  test("should use stop_reason if finishReason is not provided", () => {
    const response: Messages = {
      id: "msg_123",
      type: "message",
      role: "assistant",
      content: [],
      model: "anthropic/claude-sonnet-4-20250514",
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    };

    const attrs = getMessagesResponseAttributes(response, "recommended");
    expect(attrs["gen_ai.response.finish_reasons"]).toEqual(["end_turn"]);
  });

  test("should return empty finish_reasons if neither finishReason nor stop_reason", () => {
    const response: Messages = {
      id: "msg_123",
      type: "message",
      role: "assistant",
      content: [],
      model: "anthropic/claude-sonnet-4-20250514",
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    };

    const attrs = getMessagesResponseAttributes(response, "recommended");
    expect(attrs["gen_ai.response.finish_reasons"]).toEqual([]);
  });

  test("should map output messages in full mode", () => {
    const response: Messages = {
      id: "msg_123",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "Hi there" }],
      model: "anthropic/claude-sonnet-4-20250514",
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    };

    const attrs = getMessagesResponseAttributes(response, "full");

    expect(attrs["gen_ai.output.messages"]).toEqual([
      JSON.stringify({
        role: "assistant",
        parts: [{ type: "text", content: "Hi there" }],
      }),
    ]);
  });

  test("should map tool_use and thinking blocks in output in full mode", () => {
    const response: Messages = {
      id: "msg_123",
      type: "message",
      role: "assistant",
      content: [
        { type: "thinking", thinking: "Let me think...", signature: "sig" },
        { type: "redacted_thinking", data: "encrypted" },
        {
          type: "tool_use",
          id: "tool_1",
          name: "get_weather",
          input: { location: "NYC" },
        },
      ],
      model: "anthropic/claude-sonnet-4-20250514",
      stop_reason: "tool_use",
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    };

    const attrs = getMessagesResponseAttributes(response, "full");

    expect(attrs["gen_ai.output.messages"]).toEqual([
      JSON.stringify({
        role: "assistant",
        parts: [
          { type: "reasoning", content: "Let me think..." },
          { type: "reasoning", content: "[ENCRYPTED_REASONING]" },
          {
            type: "tool_call",
            id: "tool_1",
            name: "get_weather",
            arguments: '{"location":"NYC"}',
          },
        ],
      }),
    ]);
  });
});
