import { simulateReadableStream } from "ai";
import { MockLanguageModelV3, MockProviderV3 } from "ai/test";
import { describe, expect, test } from "bun:test";

import { parseResponse, postJson } from "../../../test/helpers/http";
import { defineModelCatalog } from "../../models/catalog";
import { responses } from "./handler";

const baseUrl = "http://localhost/responses";

describe("Responses Handler", () => {
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

  const endpoint = responses({
    providers: {
      groq: new MockProviderV3({
        languageModels: {
          "openai/gpt-oss-20b": mockLanguageModel,
        },
      }),
    },
    models: defineModelCatalog({
      "openai/gpt-oss-20b": {
        name: "GPT-OSS 20B",
        modalities: { input: ["text", "file"], output: ["text"] },
        providers: ["groq"],
      },
    }),
  });

  test("should return 405 for non-POST requests", async () => {
    const request = new Request(baseUrl, { method: "GET" });
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

  test("should return 400 for invalid JSON", async () => {
    const request = new Request(baseUrl, {
      method: "POST",
      body: "invalid-json",
    });
    const res = await endpoint.handler(request);
    const data = await parseResponse(res);
    expect(data).toMatchObject({
      error: {
        code: "bad_request",
        message: "Invalid JSON",
        type: "invalid_request_error",
      },
    });
  });

  test("should return 400 for validation errors (missing input)", async () => {
    const request = postJson(baseUrl, { model: "openai/gpt-oss-20b" });
    const res = await endpoint.handler(request);
    const data = await parseResponse(res);
    expect(data).toMatchObject({
      error: {
        code: "bad_request",
        type: "invalid_request_error",
      },
    });
  });

  test("should generate non-streaming response successfully", async () => {
    const request = postJson(baseUrl, {
      model: "openai/gpt-oss-20b",
      input: "hi",
    });
    const res = await endpoint.handler(request);
    const data = await parseResponse(res);

    expect(data).toMatchObject({
      id: expect.stringMatching(/^resp_/),
      object: "response",
      created_at: expect.any(Number),
      status: "completed",
      model: "openai/gpt-oss-20b",
      output: [
        {
          id: expect.stringMatching(/^msg_/),
          type: "message",
          role: "assistant",
          status: "completed",
          content: [{ type: "output_text", text: "Hello from AI" }],
        },
      ],
      usage: {
        input_tokens: 10,
        output_tokens: 20,
        total_tokens: 30,
        output_tokens_details: {
          reasoning_tokens: 10,
        },
        input_tokens_details: {
          cached_tokens: 20,
          cache_write_tokens: 0,
        },
      },
      provider_metadata: { provider: { key: "value" } },
      error: null,
      previous_response_id: null,
      instructions: null,
    });
  });

  test("should generate response with tool calls successfully", async () => {
    const request = postJson(baseUrl, {
      model: "openai/gpt-oss-20b",
      input: "What is the weather in SF?",
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

    expect(data.output[0].tool_calls).toEqual([
      {
        id: "call_123",
        type: "function",
        function: {
          name: "get_current_weather",
          arguments: '{"location":"San Francisco, CA"}',
        },
      },
    ]);
  });

  test("should generate streaming response successfully", async () => {
    const request = postJson(baseUrl, {
      model: "openai/gpt-oss-20b",
      input: "hi",
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

    expect(result).toContain('"type":"response.created"');
    expect(result).toContain('"sequence_number":');
    expect(result).toContain('"type":"response.content_part.added"');
    expect(result).toContain('"type":"response.output_text.delta"');
    expect(result).toContain('"delta":"Hello"');
    expect(result).toContain('"type":"response.content_part.done"');
    expect(result).toContain('"type":"response.completed"');
    expect(result).toContain("event: response.output_text.delta");
    expect(result).toContain("data: [DONE]");
  });
});
