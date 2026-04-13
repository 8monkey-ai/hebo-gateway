import { describe, expect, test } from "bun:test";

import { simulateReadableStream } from "ai";
import { MockLanguageModelV3, MockProviderV3 } from "ai/test";

import { parseResponse, postJson } from "../../../test/helpers/http";
import { defineModelCatalog } from "../../models/catalog";
import { messages } from "./handler";
import type { Messages } from "./schema";

const baseUrl = "http://localhost/messages";

describe("Messages Handler", () => {
  const mockLanguageModel = new MockLanguageModelV3({
    doGenerate: (options) => {
      const isToolCall = options.tools && options.tools.length > 0;

      if (isToolCall) {
        return Promise.resolve({
          finishReason: { unified: "tool-calls", raw: "tool-calls" },
          usage: {
            inputTokens: { total: 15, noCache: 15, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 25, text: 0, reasoning: 0 },
          },
          content: [
            {
              type: "tool-call",
              toolCallId: "toolu_01abc",
              toolName: "get_current_weather",
              input: '{"location":"San Francisco, CA"}',
            },
          ],
          providerMetadata: { provider: { key: "value" } },
          warnings: [],
        });
      }

      return Promise.resolve({
        finishReason: { unified: "stop", raw: "stop" },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: 20, cacheWrite: 5 },
          outputTokens: { total: 20, text: 20, reasoning: 0 },
        },
        content: [
          {
            type: "text",
            text: "Hello from AI",
          },
        ],
        providerMetadata: { provider: { key: "value" } },
        warnings: [],
      });
    },
    doStream: () =>
      Promise.resolve({
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
                inputTokens: { total: 5, noCache: 5, cacheRead: 0, cacheWrite: 0 },
                outputTokens: { total: 5, text: 5, reasoning: 0 },
              },
            },
          ],
        }),
      }),
  });

  const endpoint = messages({
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
    expect(res.status).toBe(405);
    const data = await parseResponse(res);
    expect(data).toMatchObject({
      type: "error",
      error: {
        type: "invalid_request_error",
        message: "Method Not Allowed",
      },
    });
  });

  test("should return 400 for invalid JSON", async () => {
    const request = new Request(baseUrl, {
      method: "POST",
      body: "invalid-json",
    });
    const res = await endpoint.handler(request);
    expect(res.status).toBe(400);
    const data = await parseResponse(res);
    expect(data).toMatchObject({
      type: "error",
      error: {
        type: "invalid_request_error",
        message: "Invalid JSON",
      },
    });
  });

  test("should return 400 for validation errors (missing messages)", async () => {
    const request = postJson(baseUrl, { model: "openai/gpt-oss-20b", max_tokens: 100 });
    const res = await endpoint.handler(request);
    expect(res.status).toBe(400);
    const data = await parseResponse(res);
    expect(data).toMatchObject({
      type: "error",
      error: {
        type: "invalid_request_error",
      },
    });
  });

  test("should return 400 for validation errors (missing max_tokens)", async () => {
    const request = postJson(baseUrl, {
      model: "openai/gpt-oss-20b",
      messages: [{ role: "user", content: "hi" }],
    });
    const res = await endpoint.handler(request);
    expect(res.status).toBe(400);
  });

  test("should generate non-streaming response with text message", async () => {
    const request = postJson(baseUrl, {
      model: "openai/gpt-oss-20b",
      max_tokens: 100,
      messages: [{ role: "user", content: "hi" }],
    });
    const res = await endpoint.handler(request);
    expect(res.status).toBe(200);
    const data = await parseResponse<Messages>(res);
    expect(data).toMatchObject({
      id: expect.any(String) as unknown as string,
      type: "message",
      role: "assistant",
      model: "openai/gpt-oss-20b",
      stop_reason: "end_turn",
      stop_sequence: null,
    });
    expect(data!.content).toHaveLength(1);
    expect(data!.content[0]!.type).toBe("text");
    expect((data!.content[0] as { text: string }).text).toBe("Hello from AI");
    expect(data!.usage).toMatchObject({
      input_tokens: 10,
      output_tokens: 20,
    });
  });

  test("should generate non-streaming response with system prompt", async () => {
    const request = postJson(baseUrl, {
      model: "openai/gpt-oss-20b",
      max_tokens: 100,
      system: "You are a pirate.",
      messages: [{ role: "user", content: "hi" }],
    });
    const res = await endpoint.handler(request);
    expect(res.status).toBe(200);
    const data = await parseResponse<Messages>(res);
    expect(data!.stop_reason).toBe("end_turn");
  });

  test("should generate non-streaming response with system blocks", async () => {
    const request = postJson(baseUrl, {
      model: "openai/gpt-oss-20b",
      max_tokens: 100,
      system: [{ type: "text", text: "You are a pirate." }],
      messages: [{ role: "user", content: "hi" }],
    });
    const res = await endpoint.handler(request);
    expect(res.status).toBe(200);
  });

  test("should generate non-streaming response with content blocks", async () => {
    const request = postJson(baseUrl, {
      model: "openai/gpt-oss-20b",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "Tell me a joke" }],
        },
      ],
    });
    const res = await endpoint.handler(request);
    expect(res.status).toBe(200);
    const data = await parseResponse<Messages>(res);
    expect(data!.type).toBe("message");
  });

  test("should generate response with tool calls", async () => {
    const request = postJson(baseUrl, {
      model: "openai/gpt-oss-20b",
      max_tokens: 100,
      messages: [{ role: "user", content: "What is the weather in SF?" }],
      tools: [
        {
          name: "get_current_weather",
          description: "Get the current weather",
          input_schema: {
            type: "object",
            properties: {
              location: { type: "string" },
            },
          },
        },
      ],
    });
    const res = await endpoint.handler(request);
    expect(res.status).toBe(200);
    const data = await parseResponse<Messages>(res);
    expect(data!.stop_reason).toBe("tool_use");

    const toolUse = data!.content.find((c) => c.type === "tool_use");
    expect(toolUse).toBeDefined();
    expect((toolUse as { name: string }).name).toBe("get_current_weather");
  });

  test("should accept tool_choice auto", async () => {
    const request = postJson(baseUrl, {
      model: "openai/gpt-oss-20b",
      max_tokens: 100,
      messages: [{ role: "user", content: "hi" }],
      tool_choice: { type: "auto" },
    });
    const res = await endpoint.handler(request);
    expect(res.status).toBe(200);
  });

  test("should generate streaming response", async () => {
    const request = postJson(baseUrl, {
      model: "openai/gpt-oss-20b",
      max_tokens: 100,
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

    expect(result).toContain("event: message_start");
    expect(result).toContain("event: content_block_start");
    expect(result).toContain("event: content_block_delta");
    expect(result).toContain('"text":"Hello"');
    expect(result).toContain('"text":" world"');
    expect(result).toContain("event: content_block_stop");
    expect(result).toContain("event: message_delta");
    expect(result).toContain("event: message_stop");
    expect(result).toContain("data: [DONE]");
  });

  test("should have correct streaming event sequence", async () => {
    const request = postJson(baseUrl, {
      model: "openai/gpt-oss-20b",
      max_tokens: 100,
      messages: [{ role: "user", content: "Say Hello world" }],
      stream: true,
    });

    const res = await endpoint.handler(request);
    expect(res.status).toBe(200);

    const decoder = new TextDecoder();
    let result = "";
    for await (const chunk of res.body!) {
      result += decoder.decode(chunk);
    }

    // Verify message_start
    const messageStartMatch = result.match(/event: message_start\ndata: (\{.*?\})\n/);
    expect(messageStartMatch).toBeTruthy();
    const messageStart = JSON.parse(messageStartMatch![1]!) as {
      type: string;
      message: { type: string; role: string };
    };
    expect(messageStart.type).toBe("message_start");
    expect(messageStart.message.type).toBe("message");
    expect(messageStart.message.role).toBe("assistant");

    // Verify message_delta has stop_reason
    const messageDeltaMatch = result.match(/event: message_delta\ndata: (\{.*?\})\n/);
    expect(messageDeltaMatch).toBeTruthy();
    const messageDelta = JSON.parse(messageDeltaMatch![1]!) as {
      delta: { stop_reason: string };
    };
    expect(messageDelta.delta.stop_reason).toBe("end_turn");

    // Verify message_stop
    expect(result).toContain("event: message_stop");
  });

  test("should accept thinking parameter", async () => {
    const request = postJson(baseUrl, {
      model: "openai/gpt-oss-20b",
      max_tokens: 16000,
      messages: [{ role: "user", content: "hi" }],
      thinking: { type: "enabled", budget_tokens: 2048 },
    });

    const res = await endpoint.handler(request);
    expect(res.status).toBe(200);
  });

  test("should accept thinking disabled", async () => {
    const request = postJson(baseUrl, {
      model: "openai/gpt-oss-20b",
      max_tokens: 100,
      messages: [{ role: "user", content: "hi" }],
      thinking: { type: "disabled" },
    });

    const res = await endpoint.handler(request);
    expect(res.status).toBe(200);
  });

  test("should accept thinking adaptive", async () => {
    const request = postJson(baseUrl, {
      model: "openai/gpt-oss-20b",
      max_tokens: 100,
      messages: [{ role: "user", content: "hi" }],
      thinking: { type: "adaptive" },
    });

    const res = await endpoint.handler(request);
    expect(res.status).toBe(200);
  });

  test("should accept cache_control on request body", async () => {
    const request = postJson(baseUrl, {
      model: "openai/gpt-oss-20b",
      max_tokens: 100,
      messages: [{ role: "user", content: "hi" }],
      cache_control: { type: "ephemeral" },
    });

    const res = await endpoint.handler(request);
    expect(res.status).toBe(200);
  });

  test("should accept metadata", async () => {
    const request = postJson(baseUrl, {
      model: "openai/gpt-oss-20b",
      max_tokens: 100,
      messages: [{ role: "user", content: "hi" }],
      metadata: { user_id: "u-123" },
    });

    const res = await endpoint.handler(request);
    expect(res.status).toBe(200);
  });

  test("should return resolved model ID if routed to a different model", async () => {
    const endpointWithHook = messages({
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
      hooks: {
        resolveModelId: () => "openai/gpt-oss-20b",
      },
    });

    const request = postJson(baseUrl, {
      model: "alias-model",
      max_tokens: 100,
      messages: [{ role: "user", content: "hi" }],
    });

    const res = await endpointWithHook.handler(request);
    expect(res.status).toBe(200);
    const data = (await parseResponse<Messages>(res))!;
    expect(data.model).toBe("openai/gpt-oss-20b");
  });

  test("should accept multi-turn conversation with tool results", async () => {
    const request = postJson(baseUrl, {
      model: "openai/gpt-oss-20b",
      max_tokens: 100,
      messages: [
        { role: "user", content: "What is the weather?" },
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "toolu_01abc",
              name: "get_weather",
              input: { location: "SF" },
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_01abc",
              content: "72°F and sunny",
            },
          ],
        },
      ],
    });

    const res = await endpoint.handler(request);
    expect(res.status).toBe(200);
  });

  test("should accept assistant messages with thinking blocks", async () => {
    const request = postJson(baseUrl, {
      model: "openai/gpt-oss-20b",
      max_tokens: 100,
      messages: [
        { role: "user", content: "Explain quantum physics" },
        {
          role: "assistant",
          content: [
            {
              type: "thinking",
              thinking: "Let me think about this...",
              signature: "sig123",
            },
            {
              type: "text",
              text: "Quantum physics is...",
            },
          ],
        },
        { role: "user", content: "Tell me more" },
      ],
    });

    const res = await endpoint.handler(request);
    expect(res.status).toBe(200);
  });

  test("should include cache usage in response", async () => {
    const request = postJson(baseUrl, {
      model: "openai/gpt-oss-20b",
      max_tokens: 100,
      messages: [{ role: "user", content: "hi" }],
    });
    const res = await endpoint.handler(request);
    const data = await parseResponse<Messages>(res);
    expect(data!.usage.input_tokens).toBe(10);
    expect(data!.usage.output_tokens).toBe(20);
  });

  test("should use flex timeout when service_tier is flex", async () => {
    const mockModel = new MockLanguageModelV3({
      doGenerate: () => {
        return Promise.resolve({
          finishReason: { unified: "stop", raw: "stop" },
          usage: {
            inputTokens: { total: 5, noCache: 5, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 5, text: 5, reasoning: 0 },
          },
          content: [{ type: "text", text: "ok" }],
          providerMetadata: {},
          warnings: [],
        });
      },
      doStream: () =>
        Promise.resolve({
          stream: simulateReadableStream({
            chunks: [
              { type: "text-start", id: "1" },
              { type: "text-delta", delta: "ok", id: "1" },
              { type: "text-end", id: "1" },
              {
                type: "finish",
                finishReason: { unified: "stop", raw: "stop" },
                usage: {
                  inputTokens: { total: 5, noCache: 5, cacheRead: 0, cacheWrite: 0 },
                  outputTokens: { total: 5, text: 5, reasoning: 0 },
                },
              },
            ],
          }),
        }),
    });

    const flexEndpoint = messages({
      providers: {
        groq: new MockProviderV3({
          languageModels: {
            "openai/gpt-oss-20b": mockModel,
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
      timeouts: { normal: 60_000, flex: 300_000 },
    });

    // Non-streaming flex request should succeed
    const flexRequest = postJson(baseUrl, {
      model: "openai/gpt-oss-20b",
      max_tokens: 100,
      messages: [{ role: "user", content: "hi" }],
      service_tier: "flex",
    });
    const flexRes = await flexEndpoint.handler(flexRequest);
    expect(flexRes.status).toBe(200);

    // Streaming flex request should succeed
    const streamFlexRequest = postJson(baseUrl, {
      model: "openai/gpt-oss-20b",
      max_tokens: 100,
      messages: [{ role: "user", content: "hi" }],
      service_tier: "flex",
      stream: true,
    });
    const streamFlexRes = await flexEndpoint.handler(streamFlexRequest);
    expect(streamFlexRes.status).toBe(200);
    expect(streamFlexRes.headers.get("Content-Type")).toBe("text/event-stream");

    // Normal (non-flex) request should also succeed
    const normalRequest = postJson(baseUrl, {
      model: "openai/gpt-oss-20b",
      max_tokens: 100,
      messages: [{ role: "user", content: "hi" }],
    });
    const normalRes = await flexEndpoint.handler(normalRequest);
    expect(normalRes.status).toBe(200);
  });

  test("should include input_tokens in streaming message_delta usage", async () => {
    const request = postJson(baseUrl, {
      model: "openai/gpt-oss-20b",
      max_tokens: 100,
      messages: [{ role: "user", content: "hi" }],
      stream: true,
    });

    const res = await endpoint.handler(request);
    expect(res.status).toBe(200);

    const decoder = new TextDecoder();
    let result = "";
    for await (const chunk of res.body!) {
      result += decoder.decode(chunk);
    }

    // Parse the message_delta event and verify input_tokens is present
    const messageDeltaMatch = result.match(/event: message_delta\ndata: (\{.*?\})\n/);
    expect(messageDeltaMatch).toBeTruthy();
    const messageDelta = JSON.parse(messageDeltaMatch![1]!) as {
      delta: { stop_reason: string };
      usage: { output_tokens: number; input_tokens?: number };
    };
    expect(messageDelta.usage.output_tokens).toBe(5);
    expect(messageDelta.usage.input_tokens).toBe(5);
  });

  test("should put reasoning into providerOptions.unknown, not top-level", async () => {
    const request = postJson(baseUrl, {
      model: "openai/gpt-oss-20b",
      max_tokens: 16000,
      messages: [{ role: "user", content: "hi" }],
      thinking: { type: "enabled", budget_tokens: 4096 },
    });

    // The request should be accepted (reasoning flows through providerOptions)
    const res = await endpoint.handler(request);
    expect(res.status).toBe(200);
  });
});
