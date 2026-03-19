import { simulateReadableStream } from "ai";
import { MockLanguageModelV3, MockProviderV3 } from "ai/test";
import { describe, expect, test } from "bun:test";

import { parseResponse, postJson } from "../../../test/helpers/http";
import { defineModelCatalog } from "../../models/catalog";
import { responses } from "./handler";
import { type Responses } from "./schema";

const baseUrl = "http://localhost/responses";

describe("Responses Handler", () => {
  const mockLanguageModel = new MockLanguageModelV3({
    // oxlint-disable-next-line require-await
    doGenerate: async (options) => {
      const isToolCall = options.tools && options.tools.length > 0;

      if (isToolCall) {
        return {
          finishReason: { unified: "tool-calls", raw: "tool-calls" },
          usage: {
            inputTokens: { total: 15, noCache: 15, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 25, text: 0, reasoning: 0 },
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
    // oxlint-disable-next-line require-await
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
              inputTokens: { total: 5, noCache: 5, cacheRead: 0, cacheWrite: 0 },
              outputTokens: { total: 5, text: 5, reasoning: 0 },
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
    expect(res.status).toBe(405);
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
    expect(res.status).toBe(400);
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
    expect(res.status).toBe(400);
    const data = await parseResponse(res);
    expect(data).toMatchObject({
      error: {
        code: "bad_request",
        type: "invalid_request_error",
      },
    });
  });

  test("should return 422 for non-existent model", async () => {
    const request = postJson(baseUrl, {
      model: "non-existent",
      input: "hi",
    });
    const res = await endpoint.handler(request);
    expect(res.status).toBe(422);
    const data = await parseResponse(res);
    expect(data).toMatchObject({
      error: {
        code: "model_not_found",
        message: "Model 'non-existent' not found in catalog",
        type: "invalid_request_error",
      },
    });
  });

  test("should generate non-streaming response with string input", async () => {
    const request = postJson(baseUrl, {
      model: "openai/gpt-oss-20b",
      input: "hi",
    });
    const res = await endpoint.handler(request);
    const data = await parseResponse<Responses>(res);
    expect(data).toMatchObject({
      // oxlint-disable-next-line no-unsafe-assignment
      id: expect.stringMatching(/^resp_/),
      object: "response",
      status: "completed",
      model: "openai/gpt-oss-20b",
      // oxlint-disable-next-line no-unsafe-assignment
      created_at: expect.any(Number),
      // oxlint-disable-next-line no-unsafe-assignment
      completed_at: expect.any(Number),
      provider_metadata: { provider: { key: "value" } },
    });
    expect(data!.output).toHaveLength(1);
    expect(data!.output[0]!.type).toBe("message");
    expect(data!.usage).toMatchObject({
      input_tokens: 10,
      output_tokens: 20,
      total_tokens: 30,
    });
  });

  test("should generate non-streaming response with array input", async () => {
    const request = postJson(baseUrl, {
      model: "openai/gpt-oss-20b",
      input: [
        {
          type: "message",
          role: "user",
          content: "Tell me a joke",
        },
      ],
    });
    const res = await endpoint.handler(request);
    expect(res.status).toBe(200);
    const data = await parseResponse<Responses>(res);
    expect(data!.status).toBe("completed");
  });

  test("should generate non-streaming response with instructions", async () => {
    const request = postJson(baseUrl, {
      model: "openai/gpt-oss-20b",
      input: "hi",
      instructions: "You are a pirate.",
    });
    const res = await endpoint.handler(request);
    expect(res.status).toBe(200);
    const data = await parseResponse<Responses>(res);
    expect(data!.status).toBe("completed");
  });

  test("should generate response with tool calls", async () => {
    const request = postJson(baseUrl, {
      model: "openai/gpt-oss-20b",
      input: "What is the weather in SF?",
      tools: [
        {
          type: "function",
          name: "get_current_weather",
          description: "Get the current weather",
          parameters: {
            type: "object",
            properties: {
              location: { type: "string" },
            },
          },
        },
      ],
    });
    const res = await endpoint.handler(request);
    const data = await parseResponse<Responses>(res);
    expect(data!.status).toBe("completed");

    const fnCall = data!.output.find((o: { type: string }) => o.type === "function_call");
    expect(fnCall).toBeDefined();
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

    expect(result).toContain("event: response.created");
    expect(result).toContain("event: response.in_progress");
    expect(result).toContain("event: response.output_text.delta");
    expect(result).toContain('"delta":"Hello"');
    expect(result).toContain('"delta":" world"');
    expect(result).toContain("event: response.completed");
    expect(result).toContain("data: [DONE]");
  });

  test("should have in_progress status for initial streaming events", async () => {
    const request = postJson(baseUrl, {
      model: "openai/gpt-oss-20b",
      input: "Say Hello world",
      stream: true,
    });

    const res = await endpoint.handler(request);
    expect(res.status).toBe(200);

    const decoder = new TextDecoder();
    let result = "";
    for await (const chunk of res.body!) {
      result += decoder.decode(chunk);
    }

    // Check response.created
    const createdMatch = result.match(/event: response\.created\ndata: (\{.*?\})\n/);
    expect(createdMatch).toBeTruthy();
    const createdData = JSON.parse(createdMatch![1]!) as Responses;
    expect(createdData.status).toBe("in_progress");

    // Check response.in_progress
    const inProgressMatch = result.match(/event: response\.in_progress\ndata: (\{.*?\})\n/);
    expect(inProgressMatch).toBeTruthy();
    const inProgressData = JSON.parse(inProgressMatch![1]!) as Responses;
    expect(inProgressData.status).toBe("in_progress");

    // Check response.completed
    const completedMatch = result.match(/event: response\.completed\ndata: (\{.*?\})\n/);
    expect(completedMatch).toBeTruthy();
    const completedData = JSON.parse(completedMatch![1]!) as Responses;
    expect(completedData.status).toBe("completed");
  });

  test("should accept reasoning parameters", async () => {
    const request = postJson(baseUrl, {
      model: "openai/gpt-oss-20b",
      input: "hi",
      reasoning: {
        effort: "high",
        max_tokens: 1000,
      },
    });

    const res = await endpoint.handler(request);
    expect(res.status).toBe(200);
  });

  test('should accept text format "text"', async () => {
    const request = postJson(baseUrl, {
      model: "openai/gpt-oss-20b",
      input: "Say hi",
      text: {
        format: {
          type: "text",
        },
      },
    });

    const res = await endpoint.handler(request);
    expect(res.status).toBe(200);
    const data = await parseResponse<Responses>(res);
    expect(data!.status).toBe("completed");
  });

  test("should pass metadata through to response", async () => {
    const request = postJson(baseUrl, {
      model: "openai/gpt-oss-20b",
      input: "hi",
      metadata: { user_id: "u-123" },
    });

    const res = await endpoint.handler(request);
    const data = await parseResponse<Responses>(res);
    expect(data!.metadata).toEqual({ user_id: "u-123" });
  });

  test("should return original model ID even if resolved to a different ID", async () => {
    const endpointWithHook = responses({
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
        // oxlint-disable-next-line require-await
        resolveModelId: async () => "openai/gpt-oss-20b",
      },
    });

    const request = postJson(baseUrl, {
      model: "alias-model",
      input: "hi",
    });

    const res = await endpointWithHook.handler(request);
    expect(res.status).toBe(200);
    const data = (await parseResponse<Responses>(res))!;
    expect(data.model).toBe("alias-model");
  });
});
