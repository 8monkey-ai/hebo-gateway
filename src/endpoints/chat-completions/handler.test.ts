import { createProviderRegistry } from "ai";
import { MockLanguageModelV3, MockProviderV3, simulateReadableStream } from "ai/test";
import { describe, expect, test } from "bun:test";

import { parseResponse, postJson } from "../../../test/helpers/http";
import { createModelCatalog } from "../../models/catalog";
import { chatCompletions } from "./handler";

const baseUrl = "http://localhost/chat/completions";

describe("Chat Completions Handler", () => {
  const mockLanguageModel = new MockLanguageModelV3({
    // eslint-disable-next-line require-await
    doGenerate: async (options) => {
      const isToolCall = options.tools && options.tools.length > 0;

      if (isToolCall) {
        return {
          finishReason: { unified: "tool-calls", raw: "tool-calls" },
          usage: {
            inputTokens: { total: 15, noCache: 15, cacheRead: 20, cacheWrite: 0 },
            outputTokens: { total: 25, text: 0, reasoning: 10 },
          },
          content: [
            {
              type: "tool-call",
              toolCallId: "call_123",
              toolName: "get_current_weather",
              input: '{"location":"San Francisco, CA"}',
            },
          ],
          providerMetadata: { provider: { key: "value" } },
          warnings: [],
        };
      }

      return {
        finishReason: { unified: "stop", raw: "stop" },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: 20, cacheWrite: 0 },
          outputTokens: { total: 20, text: 20, reasoning: 10 },
        },
        content: [
          {
            type: "text",
            text: "Hello from AI",
          },
        ],
        providerMetadata: { provider: { key: "value" } },
        warnings: [],
      };
    },
    // eslint-disable-next-line require-await
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "1" },
          { type: "text-delta", delta: "Hello", id: "1" },
          { type: "text-delta", delta: " world", id: "1" },
          { type: "text-end", id: "1" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: "stop" },
            usage: {
              inputTokens: { total: 5, noCache: 5, cacheRead: 20, cacheWrite: 0 },
              outputTokens: { total: 5, text: 5, reasoning: 10 },
            },
          },
        ],
      }),
    }),
  });

  const registry = createProviderRegistry({
    groq: new MockProviderV3({
      languageModels: {
        "openai/gpt-oss-20b": mockLanguageModel,
      },
    }),
  });

  const catalog = createModelCatalog({
    "openai/gpt-oss-20b": {
      name: "GPT-OSS 20B",
      modalities: { input: ["text", "file"], output: ["text"] },
      providers: ["groq"],
    },
  });

  const endpoint = chatCompletions({ providers: registry, models: catalog });

  test("should return 405 for non-POST requests", async () => {
    const request = new Request(baseUrl, { method: "GET" });
    const res = await endpoint.handler(request);
    const data = await parseResponse(res);
    expect(data).toEqual({
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "Method Not Allowed",
        type: "invalid_request_error",
      },
    });
  });

  test("should return 400 for invalid JSON", async () => {
    const request = new Request(baseUrl, {
      method: "POST",
      body: "invalid-json",
    });
    const res = await endpoint.handler(request);
    const data = await parseResponse(res);
    expect(data).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Invalid JSON",
        type: "invalid_request_error",
      },
    });
  });

  test("should return 422 for validation errors (missing messages)", async () => {
    const request = postJson(baseUrl, { model: "openai/gpt-oss-20b" });
    const res = await endpoint.handler(request);
    const data = await parseResponse(res);
    expect(data).toEqual({
      error: {
        code: "UNPROCESSABLE_ENTITY",
        message: "Validation error",
        param: expect.stringContaining("✖ Invalid input"),
        type: "invalid_request_error",
      },
    });
  });

  test("should return 400 for non-existent model", async () => {
    const request = postJson(baseUrl, {
      model: "non-existent",
      messages: [{ role: "user", content: "hi" }],
    });
    const res = await endpoint.handler(request);
    const data = await parseResponse(res);
    expect(data).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Model 'non-existent' not found in catalog",
        type: "invalid_request_error",
      },
    });
  });

  test("should generate non-streaming completion successfully", async () => {
    const request = postJson(baseUrl, {
      model: "openai/gpt-oss-20b",
      messages: [{ role: "user", content: "hi" }],
    });
    const res = await endpoint.handler(request);
    const data = await parseResponse(res);
    expect(data).toEqual({
      id: expect.stringMatching(/^chatcmpl-/),
      object: "chat.completion",
      created: expect.any(Number),
      model: "openai/gpt-oss-20b",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "Hello from AI",
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
        completion_tokens_details: {
          reasoning_tokens: 10,
        },
        prompt_tokens_details: {
          cached_tokens: 20,
        },
      },
      providerMetadata: { provider: { key: "value" } },
    });
  });

  test("should generate completion with tool calls successfully", async () => {
    const request = postJson(baseUrl, {
      model: "openai/gpt-oss-20b",
      messages: [{ role: "user", content: "What is the weather in SF?" }],
      tools: [
        {
          type: "function",
          function: {
            name: "get_current_weather",
            description: "Get the current weather",
            parameters: {
              type: "object",
              properties: {
                location: { type: "string" },
              },
            },
          },
        },
      ],
    });
    const res = await endpoint.handler(request);
    const data = await parseResponse(res);
    expect(data).toEqual({
      id: expect.stringMatching(/^chatcmpl-/),
      object: "chat.completion",
      created: expect.any(Number),
      model: "openai/gpt-oss-20b",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_123",
                type: "function",
                function: {
                  name: "get_current_weather",
                  arguments: '{"location":"San Francisco, CA"}',
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: {
        prompt_tokens: 15,
        completion_tokens: 25,
        total_tokens: 40,
        completion_tokens_details: {
          reasoning_tokens: 10,
        },
        prompt_tokens_details: {
          cached_tokens: 20,
        },
      },
      providerMetadata: { provider: { key: "value" } },
    });
  });

  test("should generate streaming completion successfully", async () => {
    const request = postJson(baseUrl, {
      model: "openai/gpt-oss-20b",
      messages: [{ role: "user", content: "hi" }],
      stream: true,
    });

    const res = await endpoint.handler(request);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");

    const decoder = new TextDecoder();
    let result = "";
    for await (const chunk of res.body!) {
      result += decoder.decode(chunk);
    }

    expect(result).toContain('data: {"id":"chatcmpl-');
    expect(result).toContain('"content":"Hello');
    expect(result).toContain('"content":" world');
    expect(result).toContain('"finish_reason":"stop');
    expect(result).toContain("data: [DONE]");
  });
});
