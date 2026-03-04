import { describe, expect, test } from "bun:test";

import type { ChatCompletions, ChatCompletionsBody } from "./schema";

import { getChatRequestAttributes, getChatResponseAttributes } from "./otel";

describe("Chat Completions OTEL", () => {
  test("should map request metadata into per-key attributes", () => {
    const metadata = {
      tenant: "acme",
      "Org ID": "o-123",
    };

    const inputs: ChatCompletionsBody = {
      model: "openai/gpt-oss-20b",
      messages: [{ role: "user", content: "hi" }],
      metadata,
    };

    const attrs = getChatRequestAttributes(inputs, "recommended");

    expect(attrs["gen_ai.request.metadata"]).toBeUndefined();
    expect(attrs["gen_ai.request.metadata.tenant"]).toBe("acme");
    expect(attrs["gen_ai.request.metadata.Org ID"]).toBe("o-123");
  });

  test("should stringify each tool definition individually", () => {
    const tool1 = {
      type: "function" as const,
      function: {
        name: "get_weather",
        parameters: {
          type: "object",
          properties: {
            location: { type: "string" },
          },
          required: ["location"],
        },
      },
    };

    const tool2 = {
      type: "function" as const,
      function: {
        name: "get_time",
        parameters: {
          type: "object",
          properties: {
            timezone: { type: "string" },
          },
        },
      },
    };

    const inputs: ChatCompletionsBody = {
      model: "openai/gpt-oss-20b",
      messages: [{ role: "user", content: "hi" }],
      tools: [tool1, tool2],
    };

    const attrs = getChatRequestAttributes(inputs, "full");

    expect(attrs["gen_ai.tool.definitions"]).toEqual([
      JSON.stringify(tool1),
      JSON.stringify(tool2),
    ]);
  });

  test("should map assistant text content part arrays in request attributes", () => {
    const inputs: ChatCompletionsBody = {
      model: "openai/gpt-oss-20b",
      messages: [
        {
          role: "assistant",
          content: [
            { type: "text", text: "hello " },
            { type: "text", text: "world" },
          ],
        },
      ],
    };

    const attrs = getChatRequestAttributes(inputs, "full");

    expect(attrs["gen_ai.input.messages"]).toEqual([
      JSON.stringify({
        role: "assistant",
        parts: [
          { type: "text", content: "hello " },
          { type: "text", content: "world" },
        ],
      }),
    ]);
  });

  test("should map assistant reasoning string in request attributes", () => {
    const inputs: ChatCompletionsBody = {
      model: "openai/gpt-oss-20b",
      messages: [
        {
          role: "assistant",
          content: "final answer",
          reasoning: "fallback reasoning",
          reasoning_details: [
            {
              type: "reasoning.text",
              index: 0,
              text: "step-by-step",
            },
            {
              type: "reasoning.encrypted",
              index: 1,
              data: "encrypted",
            },
          ],
        },
      ],
    };

    const attrs = getChatRequestAttributes(inputs, "full");

    expect(attrs["gen_ai.input.messages"]).toEqual([
      JSON.stringify({
        role: "assistant",
        parts: [
          { type: "reasoning", content: "fallback reasoning" },
          { type: "text", content: "final answer" },
        ],
      }),
    ]);
  });

  test("should flatten tool content part arrays in request attributes", () => {
    const inputs: ChatCompletionsBody = {
      model: "openai/gpt-oss-20b",
      messages: [
        {
          role: "tool",
          tool_call_id: "call_1",
          content: [
            { type: "text", text: "line-1 " },
            { type: "text", text: "line-2" },
          ],
        },
      ],
    };

    const attrs = getChatRequestAttributes(inputs, "full");

    expect(attrs["gen_ai.input.messages"]).toEqual([
      JSON.stringify({
        role: "tool",
        parts: [{ type: "tool_call_response", id: "call_1", response: "line-1 line-2" }],
      }),
    ]);
  });

  test("should map user media content parts to schema-compatible uri/blob parts", () => {
    const inputs: ChatCompletionsBody = {
      model: "openai/gpt-oss-20b",
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: "https://example.com/cat.png" } },
            { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
            { type: "input_audio", input_audio: { data: "AAAA", format: "wav" } },
            {
              type: "file",
              file: { data: "AAAA", media_type: "application/pdf", filename: "brochure.pdf" },
            },
          ],
        },
      ],
    };

    const attrs = getChatRequestAttributes(inputs, "full");

    expect(attrs["gen_ai.input.messages"]).toEqual([
      JSON.stringify({
        role: "user",
        parts: [
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
            mime_type: "application/pdf",
            file_name: "brochure.pdf",
          },
        ],
      }),
    ]);
  });

  test("should map assistant text content part arrays in response attributes", () => {
    const completions: ChatCompletions = {
      id: "chatcmpl_123",
      object: "chat.completion",
      created: 1700000000,
      model: "openai/gpt-oss-20b",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: [
              { type: "text", text: "hello " },
              { type: "text", text: "world" },
            ],
          },
          finish_reason: "stop",
        },
      ],
      usage: null,
    };

    const attrs = getChatResponseAttributes(completions, "full");

    expect(attrs["gen_ai.output.messages"]).toEqual([
      JSON.stringify({
        role: "assistant",
        parts: [
          { type: "text", content: "hello " },
          { type: "text", content: "world" },
        ],
        finish_reason: "stop",
      }),
    ]);
  });

  test("should map assistant reasoning string to reasoning parts in response attributes", () => {
    const completions: ChatCompletions = {
      id: "chatcmpl_123",
      object: "chat.completion",
      created: 1700000000,
      model: "openai/gpt-oss-20b",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "final answer",
            reasoning: "chain-of-thought",
          },
          finish_reason: "stop",
        },
      ],
      usage: null,
    };

    const attrs = getChatResponseAttributes(completions, "full");

    expect(attrs["gen_ai.output.messages"]).toEqual([
      JSON.stringify({
        role: "assistant",
        parts: [
          { type: "reasoning", content: "chain-of-thought" },
          { type: "text", content: "final answer" },
        ],
        finish_reason: "stop",
      }),
    ]);
  });

  test("should map usage token attributes with cache_read_input/reasoning_output names", () => {
    const completions: ChatCompletions = {
      id: "chatcmpl_123",
      object: "chat.completion",
      created: 1700000000,
      model: "openai/gpt-oss-20b",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "done",
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
        prompt_tokens_details: {
          cached_tokens: 4,
        },
        completion_tokens_details: {
          reasoning_tokens: 6,
        },
      },
    };

    const attrs = getChatResponseAttributes(completions, "recommended");

    expect(attrs["gen_ai.usage.input_tokens"]).toBe(10);
    expect(attrs["gen_ai.usage.output_tokens"]).toBe(20);
    expect(attrs["gen_ai.usage.total_tokens"]).toBe(30);
    expect(attrs["gen_ai.usage.cache_read.input_tokens"]).toBe(4);
    expect(attrs["gen_ai.usage.reasoning.output_tokens"]).toBe(6);
  });
});
