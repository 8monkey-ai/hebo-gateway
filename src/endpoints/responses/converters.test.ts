import type { GenerateTextResult, ToolSet, Output } from "ai";

import { describe, expect, test } from "bun:test";

import {
  convertToTextCallOptions,
  convertToModelMessages,
  toResponse_,
  toResponsesUsage,
} from "./converters";

describe("Responses Converters", () => {
  describe("convertToModelMessages", () => {
    test("should convert string input to user message", () => {
      const messages = convertToModelMessages("hello");
      expect(messages).toEqual([{ role: "user", content: "hello" }]);
    });

    test("should prepend system message from instructions", () => {
      const messages = convertToModelMessages("hello", "You are helpful");
      expect(messages).toEqual([
        { role: "system", content: "You are helpful" },
        { role: "user", content: "hello" },
      ]);
    });

    test("should convert easy message items", () => {
      const messages = convertToModelMessages([
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi there" },
        { role: "user", content: "how are you?" },
      ]);
      expect(messages).toHaveLength(3);
      expect(messages[0]!.role).toBe("user");
      expect(messages[1]!.role).toBe("assistant");
      expect(messages[2]!.role).toBe("user");
    });

    test("should convert typed message items", () => {
      const messages = convertToModelMessages([
        { type: "message" as const, role: "user", content: "hello" },
      ]);
      expect(messages).toHaveLength(1);
      expect(messages[0]!.role).toBe("user");
    });

    test("should convert developer role to system", () => {
      const messages = convertToModelMessages([
        { role: "developer", content: "Be concise" },
        { role: "user", content: "hi" },
      ]);
      expect(messages[0]!.role).toBe("system");
    });

    test("should convert function_call and function_call_output items", () => {
      const messages = convertToModelMessages([
        { role: "user", content: "What's the weather?" },
        {
          type: "function_call" as const,
          call_id: "fc_1",
          name: "get_weather",
          arguments: '{"city":"SF"}',
        },
        {
          type: "function_call_output" as const,
          call_id: "fc_1",
          output: '{"temp":72}',
        },
      ]);
      expect(messages).toHaveLength(3);
      expect(messages[0]!.role).toBe("user");
      expect(messages[1]!.role).toBe("assistant");
      expect(messages[2]!.role).toBe("tool");

      const assistantContent = messages[1]!.content;
      expect(Array.isArray(assistantContent)).toBe(true);
      expect((assistantContent as unknown[])[0]).toMatchObject({
        type: "tool-call",
        toolCallId: "fc_1",
        toolName: "get_weather",
      });

      const toolContent = messages[2]!.content;
      expect(Array.isArray(toolContent)).toBe(true);
      expect((toolContent as unknown[])[0]).toMatchObject({
        type: "tool-result",
        toolCallId: "fc_1",
        toolName: "get_weather",
      });
    });

    test("should convert input_text content parts", () => {
      const messages = convertToModelMessages([
        {
          role: "user",
          content: [{ type: "input_text" as const, text: "hello world" }],
        },
      ]);
      expect(messages).toHaveLength(1);
      expect(Array.isArray(messages[0]!.content)).toBe(true);
      expect((messages[0]!.content as unknown[])[0]).toMatchObject({
        type: "text",
        text: "hello world",
      });
    });
  });

  describe("convertToTextCallOptions", () => {
    test("should map max_output_tokens to maxOutputTokens", () => {
      const result = convertToTextCallOptions({
        input: "hi",
        max_output_tokens: 200,
      });
      expect(result.maxOutputTokens).toBe(200);
    });

    test("should convert text json_schema format to output", () => {
      const result = convertToTextCallOptions({
        input: "hi",
        text: {
          format: {
            type: "json_schema",
            name: "weather",
            schema: {
              type: "object",
              properties: { city: { type: "string" } },
            },
          },
        },
      });
      expect(result.output).toBeDefined();
      expect(result.output!.name).toBe("object");
    });

    test("should handle text format type text as default", () => {
      const result = convertToTextCallOptions({
        input: "hi",
        text: { format: { type: "text" } },
      });
      expect(result.output).toBeUndefined();
    });

    test("should convert function tools into tool set", () => {
      const result = convertToTextCallOptions({
        input: "hi",
        tools: [
          {
            type: "function",
            name: "get_weather",
            description: "Get weather",
            parameters: { type: "object", properties: {} },
          },
        ],
      });
      expect(result.tools).toBeDefined();
      expect(Object.keys(result.tools!)).toEqual(["get_weather"]);
    });

    test("should map tool_choice string values", () => {
      const result = convertToTextCallOptions({
        input: "hi",
        tool_choice: "required",
      });
      expect(result.toolChoice).toBe("required");
    });

    test("should map named function tool_choice", () => {
      const result = convertToTextCallOptions({
        input: "hi",
        tool_choice: { type: "function", name: "my_fn" },
      });
      expect(result.toolChoice).toEqual({ type: "tool", toolName: "my_fn" });
    });

    test("should map service_tier into providerOptions.unknown", () => {
      const result = convertToTextCallOptions({
        input: "hi",
        service_tier: "priority",
      });
      expect(result.providerOptions).toEqual({
        unknown: { service_tier: "priority" },
      });
    });

    test("should map prompt_cache_key into providerOptions.unknown", () => {
      const result = convertToTextCallOptions({
        input: "hi",
        prompt_cache_key: "tenant:docs:v1",
      });
      expect(result.providerOptions).toEqual({
        unknown: { prompt_cache_key: "tenant:docs:v1" },
      });
    });
  });

  describe("toResponse_", () => {
    test("should create a valid response from generate result", () => {
      const response = toResponse_(
        {
          finishReason: "stop",
          text: "Hello from AI",
          content: [{ type: "text", text: "Hello from AI" }],
          toolCalls: [],
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
          warnings: [],
          providerMetadata: { provider: { key: "value" } },
        } as unknown as GenerateTextResult<ToolSet, Output.Output>,
        "openai/gpt-5",
      );

      expect(response.id).toStartWith("resp_");
      expect(response.object).toBe("response");
      expect(response.status).toBe("completed");
      expect(response.model).toBe("openai/gpt-5");
      expect(response.output.length).toBeGreaterThan(0);

      const msgItem = response.output.find((i) => i.type === "message");
      expect(msgItem).toBeDefined();
      if (msgItem?.type === "message") {
        expect(msgItem.content[0]!.text).toBe("Hello from AI");
      }
    });

    test("should create function_call output items for tool calls", () => {
      const response = toResponse_(
        {
          finishReason: "tool-calls",
          text: "",
          content: [
            {
              type: "tool-call",
              toolCallId: "call_1",
              toolName: "get_weather",
              input: { city: "SF" },
            },
          ],
          toolCalls: [
            {
              toolCallId: "call_1",
              toolName: "get_weather",
              input: { city: "SF" },
            },
          ],
          usage: {},
          warnings: [],
        } as unknown as GenerateTextResult<ToolSet, Output.Output>,
        "openai/gpt-5",
      );

      expect(response.status).toBe("completed");
      const fcItem = response.output.find((i) => i.type === "function_call");
      expect(fcItem).toBeDefined();
      if (fcItem?.type === "function_call") {
        expect(fcItem.name).toBe("get_weather");
        expect(fcItem.arguments).toBe('{"city":"SF"}');
        expect(fcItem.status).toBe("completed");
      }
    });

    test("should set incomplete status for length finish reason", () => {
      const response = toResponse_(
        {
          finishReason: "length",
          text: "partial...",
          content: [{ type: "text", text: "partial..." }],
          toolCalls: [],
          usage: {},
          warnings: [],
        } as unknown as GenerateTextResult<ToolSet, Output.Output>,
        "openai/gpt-5",
      );

      expect(response.status).toBe("incomplete");
      expect(response.incomplete_details).toEqual({ reason: "max_output_tokens" });
    });

    test("should set failed status for error finish reason", () => {
      const response = toResponse_(
        {
          finishReason: "error",
          text: "",
          content: [],
          toolCalls: [],
          usage: {},
          warnings: [],
        } as unknown as GenerateTextResult<ToolSet, Output.Output>,
        "openai/gpt-5",
      );

      expect(response.status).toBe("failed");
    });
  });

  describe("toResponsesUsage", () => {
    test("should map usage fields correctly", () => {
      const usage = toResponsesUsage({
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
          reasoningTokens: 5,
        },
      });

      expect(usage.input_tokens).toBe(100);
      expect(usage.output_tokens).toBe(20);
      expect(usage.total_tokens).toBe(120);
      expect(usage.output_tokens_details).toEqual({ reasoning_tokens: 5 });
      expect(usage.input_tokens_details).toEqual({
        cached_tokens: 60,
        cache_write_tokens: 10,
      });
    });
  });
});
