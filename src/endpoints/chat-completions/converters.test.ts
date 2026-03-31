import type {
  GenerateTextResult,
  ToolSet,
  Output,
  TextPart,
  FilePart,
  LanguageModelUsage,
} from "ai";

import { describe, expect, test } from "bun:test";

import type { ChatCompletionsToolMessage } from "./schema";

import {
  convertToTextCallOptions,
  toChatCompletions,
  toChatCompletionsAssistantMessage,
  toChatCompletionsToolCall,
  toChatCompletionsUsage,
  fromChatCompletionsAssistantMessage,
  fromChatCompletionsToolResultMessage,
} from "./converters";

const mockUsage = (overrides: Partial<LanguageModelUsage> = {}): LanguageModelUsage =>
  ({
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    inputTokenDetails: {
      cacheReadTokens: undefined,
      cacheWriteTokens: undefined,
      noCacheTokens: undefined,
    },
    outputTokenDetails: {
      textTokens: undefined,
      reasoningTokens: undefined,
    },
    ...overrides,
  }) satisfies LanguageModelUsage;

const mockGenerateTextResult = (
  overrides: Partial<GenerateTextResult<ToolSet, Output.Output>>,
): GenerateTextResult<ToolSet, Output.Output> =>
  ({
    text: "",
    toolCalls: [],
    staticToolCalls: [],
    dynamicToolCalls: [],
    toolResults: [],
    staticToolResults: [],
    dynamicToolResults: [],
    finishReason: "stop",
    usage: mockUsage(),
    totalUsage: mockUsage(),
    warnings: [],
    content: [],
    reasoning: [],
    reasoningText: undefined,
    files: [],
    sources: [],
    rawFinishReason: undefined,
    request: {},
    response: {
      id: "res-1",
      modelId: "mock",
      timestamp: new Date(),
      messages: [],
    },
    providerMetadata: undefined,
    steps: [],
    experimental_output: undefined,
    output: undefined,
    ...overrides,
  }) satisfies GenerateTextResult<ToolSet, Output.Output>;

describe("Chat Completions Converters", () => {
  describe("fromChatCompletionsToolResultMessage", () => {
    test("should handle tool message with string content", () => {
      const assistantMessage = {
        role: "assistant" as const,
        tool_calls: [
          {
            id: "call_1",
            type: "function" as const,
            function: { name: "test_tool", arguments: "{}" },
          },
        ],
      };
      const toolById = new Map<string, ChatCompletionsToolMessage>([
        ["call_1", { role: "tool", content: "hello world", tool_call_id: "call_1" }],
      ]);

      const result = fromChatCompletionsToolResultMessage(assistantMessage, toolById);
      expect(result).toBeDefined();
      expect(result!.content[0]).toMatchObject({
        type: "tool-result",
        toolCallId: "call_1",
        output: { type: "text", value: "hello world" },
      });
    });

    test("should handle tool message with content parts array", () => {
      const assistantMessage = {
        role: "assistant" as const,
        tool_calls: [
          {
            id: "call_1",
            type: "function" as const,
            function: { name: "test_tool", arguments: "{}" },
          },
        ],
      };
      const toolById = new Map<string, ChatCompletionsToolMessage>([
        [
          "call_1",
          {
            role: "tool",
            content: [
              { type: "text", text: "part 1" },
              { type: "text", text: " part 2" },
            ],
            tool_call_id: "call_1",
          },
        ],
      ]);

      const result = fromChatCompletionsToolResultMessage(assistantMessage, toolById);
      expect(result).toBeDefined();
      expect(result!.content[0]).toMatchObject({
        type: "tool-result",
        toolCallId: "call_1",
        output: {
          type: "content",
          value: [
            { type: "text", text: "part 1" },
            { type: "text", text: " part 2" },
          ],
        },
      });
    });

    test("should handle tool message with content parts array containing JSON string", () => {
      const assistantMessage = {
        role: "assistant" as const,
        tool_calls: [
          {
            id: "call_1",
            type: "function" as const,
            function: { name: "test_tool", arguments: "{}" },
          },
        ],
      };
      const toolById = new Map<string, ChatCompletionsToolMessage>([
        [
          "call_1",
          {
            role: "tool",
            content: [{ type: "text", text: '{"result": "success"}' }],
            tool_call_id: "call_1",
          },
        ],
      ]);

      const result = fromChatCompletionsToolResultMessage(assistantMessage, toolById);
      expect(result).toBeDefined();
      expect(result!.content[0]).toMatchObject({
        type: "tool-result",
        toolCallId: "call_1",
        output: {
          type: "content",
          value: [{ type: "text", text: '{"result": "success"}' }],
        },
      });
    });
  });

  describe("toChatCompletionsAssistantMessage", () => {
    test("should pass through providerMetadata to extra_content", () => {
      const mockResult = mockGenerateTextResult({
        text: "hello",
        content: [
          {
            type: "text",
            text: "hello",
            providerMetadata: {
              vertex: {
                thought_signature: "signature-abc",
              },
            },
          },
        ],
      });

      const message = toChatCompletionsAssistantMessage(mockResult);

      expect(message.extra_content).toEqual({
        vertex: {
          thought_signature: "signature-abc",
        },
      });
    });

    test("should pass through providerMetadata to tool calls", () => {
      const mockResult = mockGenerateTextResult({
        finishReason: "tool-calls",
        toolCalls: [
          {
            type: "tool-call",
            toolCallId: "call_123",
            toolName: "get_weather",
            input: { location: "London" },
            providerMetadata: {
              vertex: { thought_signature: "tool-signature" },
            },
          },
        ],
      });

      const message = toChatCompletionsAssistantMessage(mockResult);

      expect(message.tool_calls![0]!.extra_content).toEqual({
        vertex: { thought_signature: "tool-signature" },
      });
    });

    test("should extract reasoning_details from reasoning parts", () => {
      const mockResult = mockGenerateTextResult({
        text: "Final answer.",
        content: [
          {
            type: "reasoning",
            text: "I am thinking...",
            providerMetadata: {
              anthropic: {
                signature: "sig-123",
              },
            },
          },
          {
            type: "text",
            text: "Final answer.",
          },
        ],
        reasoningText: "I am thinking...",
      });

      const message = toChatCompletionsAssistantMessage(mockResult);

      expect(message.reasoning).toBe("I am thinking...");
      expect(message.reasoning_details![0]).toMatchObject({
        type: "reasoning.text",
        text: "I am thinking...",
        signature: "sig-123",
        format: "unknown",
        index: 0,
      });
      expect(message.reasoning_details![0]!.id).toStartWith("reasoning-");
      expect(message.content).toBe("Final answer.");
    });

    test("should handle redacted/encrypted reasoning", () => {
      const mockResult = mockGenerateTextResult({
        content: [
          {
            type: "reasoning",
            text: "",
            providerMetadata: {
              anthropic: {
                redactedData: "encrypted-content",
              },
            },
          },
        ],
      });

      const message = toChatCompletionsAssistantMessage(mockResult);

      expect(message.reasoning_details![0]).toMatchObject({
        type: "reasoning.encrypted",
        data: "encrypted-content",
      });
      expect(message.reasoning_details![0]!.text).toBeUndefined();
      expect(message.reasoning_details![0]!.signature).toBeUndefined();
    });
  });

  describe("fromChatCompletionsAssistantMessage", () => {
    test("should convert reasoning_details back to reasoning parts with unknown providerOptions", () => {
      const message = fromChatCompletionsAssistantMessage({
        role: "assistant",
        content: "The result is 42.",
        reasoning_details: [
          {
            type: "reasoning.text",
            text: "Thinking hard...",
            signature: "sig-xyz",
            format: "unknown",
            index: 0,
          },
        ],
      });

      expect(Array.isArray(message.content)).toBe(true);
      const content = message.content;
      expect(content).toHaveLength(2);
      expect(content[0]).toEqual({
        type: "reasoning",
        text: "Thinking hard...",
        providerOptions: {
          unknown: {
            signature: "sig-xyz",
          },
        },
      });
      expect(content[1]).toEqual({
        type: "text",
        text: "The result is 42.",
      });
    });

    test("should convert reasoning.encrypted back to reasoning parts", () => {
      const message = fromChatCompletionsAssistantMessage({
        role: "assistant",
        content: "Hello",
        reasoning_details: [
          {
            type: "reasoning.encrypted",
            data: "secret-data",
            format: "unknown",
            index: 0,
          },
        ],
      });

      expect(Array.isArray(message.content)).toBe(true);
      const content = message.content;
      expect(content[0]).toEqual({
        type: "reasoning",
        text: "",
        providerOptions: {
          unknown: {
            redactedData: "secret-data",
          },
        },
      });
    });

    test("should handle both content and tool_calls", () => {
      const message = fromChatCompletionsAssistantMessage({
        role: "assistant",
        content: "I will call a tool.",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "my_tool",
              arguments: "{}",
            },
          },
        ],
      });

      expect(Array.isArray(message.content)).toBe(true);
      const content = message.content;
      expect(content).toHaveLength(2);
      expect(content[0]).toEqual({
        type: "text",
        text: "I will call a tool.",
      });
      expect(content[1]).toEqual({
        type: "tool-call",
        toolCallId: "call_1",
        toolName: "my_tool",
        input: {},
      });
    });
  });

  describe("convertToTextCallOptions", () => {
    test("should use max_completion_tokens when present", () => {
      const result = convertToTextCallOptions({
        messages: [{ role: "user", content: "hi" }],
        max_completion_tokens: 200,
      });
      expect(result.maxOutputTokens).toBe(200);
    });

    test("should use max_tokens when max_completion_tokens is absent", () => {
      const result = convertToTextCallOptions({
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 100,
      });
      expect(result.maxOutputTokens).toBe(100);
    });

    test("should favor max_completion_tokens over max_tokens when both are present", () => {
      const result = convertToTextCallOptions({
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 100,
        max_completion_tokens: 200,
      });
      expect(result.maxOutputTokens).toBe(200);
    });

    test("should handle neither being present", () => {
      const result = convertToTextCallOptions({
        messages: [{ role: "user", content: "hi" }],
      });
      expect(result.maxOutputTokens).toBeUndefined();
    });

    test("should convert response_format json_schema to output.object", async () => {
      const result = convertToTextCallOptions({
        messages: [{ role: "user", content: "hi" }],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "weather",
            description: "Structured weather response",
            schema: {
              type: "object",
              properties: {
                city: { type: "string" },
              },
              required: ["city"],
              additionalProperties: false,
            },
            strict: true,
          },
        },
      });

      expect(result.output!.name).toBe("object");

      const parsed: unknown = await result.output!.parseCompleteOutput(
        {
          text: '{"city":"San Francisco"}',
        },
        {
          response: {
            id: "res-1",
            modelId: "mock",
            timestamp: new Date(),
          },
          usage: mockUsage(),
          finishReason: "stop",
        },
      );

      expect(parsed).toEqual({ city: "San Francisco" });
    });

    test("should treat response_format text as default text output", () => {
      const result = convertToTextCallOptions({
        messages: [{ role: "user", content: "hi" }],
        response_format: {
          type: "text",
        },
      });

      expect(result.output).toBeUndefined();
    });

    test("should convert input_audio content parts to file user content", () => {
      const result = convertToTextCallOptions({
        messages: [
          {
            role: "user",
            content: [
              {
                type: "input_audio",
                input_audio: {
                  data: "aGVsbG8=",
                  format: "wav",
                },
              },
            ],
          },
        ],
      });

      const userMessage = result.messages[0]!;
      expect(userMessage.role).toBe("user");
      expect(Array.isArray(userMessage.content)).toBe(true);

      const part = (userMessage.content as FilePart[])[0]!;
      expect(part.type).toBe("file");
      expect(part.mediaType).toBe("audio/wav");
      expect(part.data).toBeInstanceOf(Uint8Array);
      expect(Array.from(part.data as Uint8Array)).toEqual([104, 101, 108, 108, 111]);
    });

    test("should map tool_choice 'validated' to 'auto'", () => {
      const result = convertToTextCallOptions({
        messages: [{ role: "user", content: "hi" }],
        tool_choice: "validated",
      });
      expect(result.toolChoice).toBe("auto");
    });

    test("should map allowed_tools to activeTools and auto mode", () => {
      const result = convertToTextCallOptions({
        messages: [{ role: "user", content: "hi" }],
        tool_choice: {
          type: "allowed_tools",
          allowed_tools: {
            mode: "auto",
            tools: [
              {
                type: "function",
                function: { name: "get_weather" },
              },
            ],
          },
        },
      });

      expect(result.toolChoice).toBe("auto");
      expect(result.activeTools).toEqual(["get_weather"]);
    });

    test("should map allowed_tools required mode to required", () => {
      const result = convertToTextCallOptions({
        messages: [{ role: "user", content: "hi" }],
        tool_choice: {
          type: "allowed_tools",
          allowed_tools: {
            mode: "required",
            tools: [
              {
                type: "function",
                function: { name: "get_weather" },
              },
            ],
          },
        },
      });

      expect(result.toolChoice).toBe("required");
      expect(result.activeTools).toEqual(["get_weather"]);
    });

    test("should convert function tools into tool set entries", () => {
      const result = convertToTextCallOptions({
        messages: [{ role: "user", content: "hi" }],
        tools: [
          {
            type: "function",
            function: {
              name: "get_weather",
              description: "Get weather",
              parameters: {
                type: "object",
                properties: {},
              },
            },
          },
        ],
      });

      expect(result.tools).toBeDefined();
      expect(Object.keys(result.tools!)).toEqual(["get_weather"]);
    });

    test("should map prompt cache options into providerOptions.unknown", () => {
      const result = convertToTextCallOptions({
        messages: [{ role: "system", content: "You are concise." }],
        prompt_cache_key: "tenant:docs:v1",
        prompt_cache_retention: "24h",
      });

      expect(result.providerOptions).toEqual({
        unknown: {
          prompt_cache_key: "tenant:docs:v1",
          prompt_cache_retention: "24h",
          cache_control: {
            type: "ephemeral",
            ttl: "24h",
          },
        },
      });
    });

    test("should sync retention from cache_control ttl", () => {
      const result = convertToTextCallOptions({
        messages: [{ role: "system", content: "You are concise." }],
        cache_control: {
          type: "ephemeral",
          ttl: "5m",
        },
      });

      expect(result.providerOptions).toEqual({
        unknown: {
          prompt_cache_retention: "in-memory",
          cache_control: {
            type: "ephemeral",
            ttl: "5m",
          },
        },
      });
    });

    test("should preserve cache_control on message and content parts", () => {
      const result = convertToTextCallOptions({
        messages: [
          {
            role: "system",
            content: "Policy block",
            cache_control: { type: "ephemeral", ttl: "1h" },
          },
          {
            role: "user",
            content: [{ type: "text", text: "Question", cache_control: { type: "ephemeral" } }],
          },
        ],
      });

      expect(result.messages[0]!.providerOptions!["unknown"]!["cache_control"]).toEqual({
        type: "ephemeral",
        ttl: "1h",
      });
      expect(
        (result.messages[1]!.content[0] as TextPart).providerOptions!["unknown"]!["cache_control"],
      ).toEqual({
        type: "ephemeral",
      });
    });

    test("should map service_tier into providerOptions.unknown", () => {
      const result = convertToTextCallOptions({
        messages: [{ role: "user", content: "hi" }],
        service_tier: "priority",
      });

      expect(result.providerOptions).toEqual({
        unknown: {
          service_tier: "priority",
        },
      });
    });
  });

  describe("toChatCompletions", () => {
    const returnedServiceTierCases = [
      { provider: "openai", value: "auto", expected: "auto" },
      { provider: "openai", value: "flex", expected: "flex" },
      { provider: "groq", value: "on_demand", expected: "default" },
      { provider: "groq", value: "performance", expected: "priority" },
      { provider: "bedrock", value: "reserved", expected: "scale" },
    ] as const;

    for (const { provider, value, expected } of returnedServiceTierCases) {
      test(`should normalize returned ${provider} service tier ${value}`, () => {
        const completion = toChatCompletions(
          mockGenerateTextResult({
            finishReason: "stop",
            text: "hello",
            content: [{ type: "text", text: "hello" }],
            providerMetadata: {
              [provider]: {
                service_tier: value,
              },
            },
          }),
          "openai/gpt-5",
        );

        expect(completion.service_tier).toBe(expected);
      });
    }

    const geminiTrafficTypeCases = [
      { trafficType: "ON_DEMAND", expected: "default" },
      { trafficType: "ON_DEMAND_FLEX", expected: "flex" },
      { trafficType: "ON_DEMAND_PRIORITY", expected: "priority" },
      { trafficType: "PROVISIONED_THROUGHPUT", expected: "scale" },
      { trafficType: "TRAFFIC_TYPE_UNSPECIFIED", expected: "auto" },
    ] as const;

    for (const { trafficType, expected } of geminiTrafficTypeCases) {
      test(`should parse Gemini trafficType fallback ${trafficType}`, () => {
        const completion = toChatCompletions(
          mockGenerateTextResult({
            finishReason: "stop",
            text: "hello",
            content: [{ type: "text", text: "hello" }],
            providerMetadata: {
              vertex: {
                usage_metadata: {
                  traffic_type: trafficType,
                },
              },
            },
          }),
          "google/gemini-2.5-pro",
        );

        expect(completion.service_tier).toBe(expected);
      });
    }

    test("should not set service_tier when metadata is missing", () => {
      const completion = toChatCompletions(
        mockGenerateTextResult({
          finishReason: "stop",
          text: "hello",
          content: [{ type: "text", text: "hello" }],
        }),
        "openai/gpt-5",
      );

      expect(completion.service_tier).toBeUndefined();
    });
  });

  describe("toChatCompletionsUsage", () => {
    test("should include cached token details", () => {
      const usage = toChatCompletionsUsage({
        inputTokens: 100,
        outputTokens: 20,
        totalTokens: 120,
        inputTokenDetails: {
          cacheReadTokens: 60,
          cacheWriteTokens: 10,
          noCacheTokens: undefined,
        },
        outputTokenDetails: {
          textTokens: 20,
          reasoningTokens: undefined,
        },
      });

      expect(usage.prompt_tokens_details).toEqual({
        cached_tokens: 60,
        cache_write_tokens: 10,
      });
    });
  });

  describe("toChatCompletionsToolCall", () => {
    test("should filter top-level empty-string keys from object arguments", () => {
      const call = toChatCompletionsToolCall("call_1", "my_tool", {
        "": {},
        city: "San Francisco",
        nested: {
          "": {},
          country: "US",
        },
      });

      expect(call.function.arguments).toBe(
        JSON.stringify({
          city: "San Francisco",
          nested: {
            "": {},
            country: "US",
          },
        }),
      );
    });

    test("should pass through JSON string arguments unchanged", () => {
      const call = toChatCompletionsToolCall(
        "call_1",
        "my_tool",
        '{"":{},"city":"San Francisco","nested":{"":{},"country":"US"}}',
      );

      expect(call.function.arguments).toBe(
        '{"":{},"city":"San Francisco","nested":{"":{},"country":"US"}}',
      );
    });

    test("should normalize invalid tool names", () => {
      const call = toChatCompletionsToolCall("call_1", "bad. Tool- name1!@", {});
      expect(call.function.name).toBe("bad._Tool-_name1__");
    });

    test("should truncate tool names longer than 128 chars", () => {
      const call = toChatCompletionsToolCall("call_1", "a".repeat(200), {});
      expect(call.function.name).toHaveLength(128);
      expect(call.function.name).toBe("a".repeat(128));
    });
  });
});
