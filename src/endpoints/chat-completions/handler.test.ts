import { describe, expect, it, mock } from "bun:test";

import { createModelCatalog } from "../../models/catalog";
import { chatCompletions } from "./handler";

const mockGenerateText = mock((options: any) => {
  if (options.tools) {
    return {
      toolCalls: [
        {
          toolCallId: "call_123",
          toolName: "get_current_weather",
          input: { location: "San Francisco, CA" },
        },
      ],
      content: [],
      finishReason: "tool-calls",
      usage: { inputTokens: 15, outputTokens: 25, totalTokens: 40 },
      providerMetadata: { some: "metadata" },
    };
  }
  return {
    content: [{ type: "text", text: "Hello from AI" }],
    finishReason: "stop",
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    providerMetadata: { some: "metadata" },
  };
});

const mockStreamText = mock((_options: any) => {
  return {
    fullStream: (async function* () {
      yield { type: "text-delta", text: "Hello" };
      yield { type: "text-delta", text: " world" };
      yield {
        type: "finish",
        finishReason: "stop",
        totalUsage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
      };
    })(),
  };
});

mock.module("ai", () => ({
  generateText: mockGenerateText,
  streamText: mockStreamText,
}));

const parseResponse = async (res: Response) => {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

describe("Chat Completions Handler", () => {
  const mockProviders = {
    languageModel: (modelId: string) => ({
      modelId,
      provider: modelId.split(":")[0],
    }),
  } as any;

  const catalog = createModelCatalog({
    "openai/gpt-oss-20b": {
      name: "GPT-OSS 20B",
      modalities: { input: ["text", "file"], output: ["text"] },
      providers: ["groq"],
    },
  });

  const endpoint = chatCompletions({ providers: mockProviders, models: catalog });

  const testCases = [
    {
      name: "should return 405 for non-POST requests",
      request: new Request("http://localhost/chat/completions", { method: "GET" }),
      expected: {
        code: "METHOD_NOT_ALLOWED",
        message: "Method Not Allowed",
      },
    },
    {
      name: "should return 400 for invalid JSON",
      request: new Request("http://localhost/chat/completions", {
        method: "POST",
        body: "invalid-json",
      }),
      expected: {
        code: "BAD_REQUEST",
        message: "Invalid JSON",
      },
    },
    {
      name: "should return 422 for validation errors (missing messages)",
      request: new Request("http://localhost/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "openai/gpt-oss-20b" }),
      }),
      expected: {
        code: "UNPROCESSABLE_ENTITY",
        message: "Validation error",
        detail: expect.stringContaining("✖ Invalid input"),
      },
    },
    {
      name: "should return 400 for non-existent model",
      request: new Request("http://localhost/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "non-existent",
          messages: [{ role: "user", content: "hi" }],
        }),
      }),
      expected: {
        code: "BAD_REQUEST",
        message: "Model 'non-existent' not found in catalog",
      },
    },
    {
      name: "should generate non-streaming completion successfully",
      request: new Request("http://localhost/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "openai/gpt-oss-20b",
          messages: [{ role: "user", content: "hi" }],
        }),
      }),
      expected: {
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
            reasoning_tokens: 0,
          },
          prompt_tokens_details: {
            cached_tokens: 0,
          },
        },
        providerMetadata: { some: "metadata" },
      },
    },
    {
      name: "should generate completion with tool calls successfully",
      request: new Request("http://localhost/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      }),
      expected: {
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
            reasoning_tokens: 0,
          },
          prompt_tokens_details: {
            cached_tokens: 0,
          },
        },
        providerMetadata: { some: "metadata" },
      },
    },
  ];

  for (const { name, request, expected } of testCases) {
    it(name, async () => {
      mockGenerateText.mockClear();
      const res = await endpoint.handler(request);
      const data = await parseResponse(res);
      expect(data).toEqual(expected);
    });
  }

  it("should generate streaming completion successfully", async () => {
    mockStreamText.mockClear();
    const req = new Request("http://localhost/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        messages: [{ role: "user", content: "hi" }],
        stream: true,
      }),
    });

    const res = await endpoint.handler(req);
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

    expect(mockStreamText).toHaveBeenCalled();
  });
});
