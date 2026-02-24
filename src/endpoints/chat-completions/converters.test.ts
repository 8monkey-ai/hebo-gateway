import type { GenerateTextResult, ToolSet, Output } from "ai";

import { describe, expect, test } from "bun:test";

import type { ChatCompletionsToolMessage } from "./schema";

import {
  convertToTextCallOptions,
  toChatCompletionsAssistantMessage,
  toChatCompletionsToolCall,
  fromChatCompletionsAssistantMessage,
  fromChatCompletionsToolResultMessage,
} from "./converters";

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
      expect(result?.content[0]).toMatchObject({
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
      expect(result?.content[0]).toMatchObject({
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
      expect(result?.content[0]).toMatchObject({
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
      const mockResult: GenerateTextResult<ToolSet, Output.Output> = {
        content: [
          {
            type: "text",
            text: "hello",
            providerMetadata: {
              vertex: {
                thought_signature: "signature-abc",
              },
            },
          } as any,
        ],
        toolCalls: [],
      };

      const message = toChatCompletionsAssistantMessage(mockResult);

      expect(message.extra_content).toEqual({
        vertex: {
          thought_signature: "signature-abc",
        },
      });
    });

    test("should pass through providerMetadata to tool calls", () => {
      const mockResult: GenerateTextResult<ToolSet, Output.Output> = {
        content: [],
        toolCalls: [
          {
            toolCallId: "call_123",
            toolName: "get_weather",
            input: { location: "London" },
            providerMetadata: {
              vertex: { thought_signature: "tool-signature" },
            },
          },
        ],
      };

      const message = toChatCompletionsAssistantMessage(mockResult);

      expect(message.tool_calls![0].extra_content).toEqual({
        vertex: { thought_signature: "tool-signature" },
      });
    });

    test("should extract reasoning_details from reasoning parts", () => {
      const mockResult: GenerateTextResult<ToolSet, Output.Output> = {
        content: [
          {
            type: "reasoning",
            text: "I am thinking...",
            providerMetadata: {
              anthropic: {
                signature: "sig-123",
              },
            },
          } as any,
          {
            type: "text",
            text: "Final answer.",
          } as any,
        ],
        reasoningText: "I am thinking...",
        toolCalls: [],
      };

      const message = toChatCompletionsAssistantMessage(mockResult);

      expect(message.reasoning_content).toBe("I am thinking...");
      expect(message.reasoning_details![0]).toMatchObject({
        type: "reasoning.text",
        text: "I am thinking...",
        signature: "sig-123",
        format: "unknown",
        index: 0,
      });
      expect(message.reasoning_details![0].id).toStartWith("reasoning-");
      expect(message.content).toBe("Final answer.");
    });

    test("should fallback to reasoningText if no reasoning parts in content", () => {
      const mockResult: GenerateTextResult<ToolSet, Output.Output> = {
        content: [
          {
            type: "text",
            text: "Hello",
          } as any,
        ],
        reasoningText: "Thinking via text...",
        toolCalls: [],
      };

      const message = toChatCompletionsAssistantMessage(mockResult);

      expect(message.reasoning_content).toBe("Thinking via text...");
      expect(message.reasoning_details![0]).toMatchObject({
        type: "reasoning.text",
        text: "Thinking via text...",
        index: 0,
      });
      expect(message.reasoning_details![0].id).toStartWith("reasoning-");
    });

    test("should handle redacted/encrypted reasoning", () => {
      const mockResult: GenerateTextResult<ToolSet, Output.Output> = {
        content: [
          {
            type: "reasoning",
            text: "",
            providerMetadata: {
              anthropic: {
                redactedData: "encrypted-content",
              },
            },
          } as any,
        ],
        toolCalls: [],
      };

      const message = toChatCompletionsAssistantMessage(mockResult);

      expect(message.reasoning_details![0]).toMatchObject({
        type: "reasoning.encrypted",
        data: "encrypted-content",
      });
      expect((message.reasoning_details![0] as any).text).toBeUndefined();
      expect(message.reasoning_details![0].signature).toBeUndefined();
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
      const content = message.content as any[];
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
      const content = message.content as any[];
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
      const content = message.content as any[];
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

      expect(result.output?.name).toBe("object");

      const parsed = await result.output!.parseCompleteOutput(
        {
          text: '{"city":"San Francisco"}',
        },
        {
          response: {} as any,
          usage: {} as any,
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

      const userMessage = result.messages[0] as any;
      expect(userMessage.role).toBe("user");
      expect(Array.isArray(userMessage.content)).toBe(true);

      const [part] = userMessage.content as any[];
      expect(part.type).toBe("file");
      expect(part.mediaType).toBe("audio/wav");
      expect(part.data).toBeInstanceOf(Uint8Array);
      expect(Array.from(part.data)).toEqual([104, 101, 108, 108, 111]);
    });

    test("should map tool_choice 'validated' to 'auto'", () => {
      const result = convertToTextCallOptions({
        messages: [{ role: "user", content: "hi" }],
        tool_choice: "validated",
      });
      expect(result.toolChoice).toBe("auto");
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
