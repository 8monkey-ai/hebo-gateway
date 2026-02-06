import type { GenerateTextResult, ToolSet, Output } from "ai";

import { describe, expect, test } from "bun:test";

import { convertToTextCallOptions, toChatCompletionsAssistantMessage } from "./converters";

describe("Chat Completions Converters", () => {
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
  });
});
