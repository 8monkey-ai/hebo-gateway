import type { GenerateTextResult, ToolSet, Output, LanguageModelUsage } from "ai";

import { describe, expect, test } from "bun:test";

import {
  convertToResponsesTextCallOptions,
  convertToResponsesModelMessages,
  toResponses,
  toResponsesUsage,
} from "./converters";

describe("Responses Converters", () => {
  describe("convertToResponsesModelMessages", () => {
    test("should convert string input to single user message", () => {
      const messages = convertToResponsesModelMessages("Hello world");
      expect(messages).toEqual([{ role: "user", content: "Hello world" }]);
    });

    test("should prepend instructions as system message", () => {
      const messages = convertToResponsesModelMessages("Hi", "You are a helpful assistant.");
      expect(messages).toEqual([
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hi" },
      ]);
    });

    test("should map cache_control into providerOptions for messages", () => {
      const messages = convertToResponsesModelMessages([
        {
          type: "message",
          role: "user",
          content: "Hello",
          cache_control: { type: "ephemeral" },
        },
      ]);
      expect(messages).toEqual([
        {
          role: "user",
          content: "Hello",
          providerOptions: { unknown: { cache_control: { type: "ephemeral" } } },
        },
      ]);
    });

    test("should convert message items to model messages", () => {
      const messages = convertToResponsesModelMessages([
        {
          type: "message",
          role: "user",
          content: "What is the weather?",
        },
      ]);
      expect(messages).toEqual([{ role: "user", content: "What is the weather?" }]);
    });

    test("should convert system and developer messages to system role", () => {
      const messages = convertToResponsesModelMessages([
        { type: "message", role: "system", content: "System prompt" },
        { type: "message", role: "developer", content: "Dev prompt" },
        { type: "message", role: "user", content: "Hi" },
      ]);
      expect(messages[0]).toEqual({ role: "system", content: "System prompt" });
      expect(messages[1]).toEqual({ role: "system", content: "Dev prompt" });
      expect(messages[2]).toEqual({ role: "user", content: "Hi" });
    });

    test("should convert assistant message with output_text content", () => {
      const messages = convertToResponsesModelMessages([
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "Hello!" }],
        },
      ]);
      expect(messages).toEqual([
        { role: "assistant", content: [{ type: "text", text: "Hello!" }] },
      ]);
    });

    test("should convert function_call and function_call_output items", () => {
      const messages = convertToResponsesModelMessages([
        {
          type: "function_call",
          call_id: "call_1",
          name: "get_weather",
          arguments: '{"city":"SF"}',
        },
        {
          type: "function_call_output",
          call_id: "call_1",
          output: '{"temp":72}',
        },
      ]);

      expect(messages).toHaveLength(2);
      // Assistant message with tool call
      expect(messages[0]).toEqual({
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call_1",
            toolName: "get_weather",
            input: { city: "SF" },
          },
        ],
      });
      // Tool result message
      expect(messages[1]).toEqual({
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call_1",
            toolName: "get_weather",
            output: { type: "json", value: { temp: 72 } },
          },
        ],
      });
    });

    test("should convert reasoning items to assistant messages", () => {
      const messages = convertToResponsesModelMessages([
        {
          type: "reasoning",
          summary: [{ type: "summary_text", text: "I'm thinking..." }],
        },
        { type: "message", role: "user", content: "Hi" },
      ]);
      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual({
        role: "assistant",
        content: [{ type: "reasoning", text: "I'm thinking...", providerOptions: undefined }],
      });
      expect(messages[1]).toEqual({ role: "user", content: "Hi" });
    });

    test("should convert user message with input content parts", () => {
      const messages = convertToResponsesModelMessages([
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Describe this image" }],
        },
      ]);
      expect(messages).toEqual([
        {
          role: "user",
          content: [{ type: "text", text: "Describe this image" }],
        },
      ]);
    });
  });

  describe("convertToResponsesTextCallOptions", () => {
    test("should set temperature and top_p", () => {
      const result = convertToResponsesTextCallOptions({
        input: "hi",
        temperature: 0.7,
        top_p: 0.9,
      });
      expect(result.temperature).toBe(0.7);
      expect(result.topP).toBe(0.9);
    });

    test("should set max_output_tokens", () => {
      const result = convertToResponsesTextCallOptions({
        input: "hi",
        max_output_tokens: 500,
      });
      expect(result.maxOutputTokens).toBe(500);
    });

    test("should set stopWhen from max_tool_calls", () => {
      const result = convertToResponsesTextCallOptions({
        input: "hi",
        max_tool_calls: 3,
      });
      // The function stepCountIs returns a function, we just check if it's defined
      expect(result.stopWhen).toBeDefined();
      expect(typeof result.stopWhen).toBe("function");
    });

    test("should set frequency_penalty and presence_penalty", () => {
      const result = convertToResponsesTextCallOptions({
        input: "hi",
        frequency_penalty: 0.5,
        presence_penalty: -0.5,
      });
      expect(result.frequencyPenalty).toBe(0.5);
      expect(result.presencePenalty).toBe(-0.5);
    });

    test("should convert text json_schema format to output", async () => {
      const result = convertToResponsesTextCallOptions({
        input: "hi",
        text: {
          format: {
            type: "json_schema",
            name: "weather",
            description: "Weather data",
            schema: {
              type: "object",
              properties: { city: { type: "string" } },
              required: ["city"],
              additionalProperties: false,
            },
            strict: true,
          },
        },
      });

      expect(result.output!.name).toBe("object");

      const parsed = await result.output!.parseCompleteOutput(
        { text: '{"city":"SF"}' },
        {
          // oxlint-disable-next-line no-unsafe-assignment
          response: {} as any,
          // oxlint-disable-next-line no-unsafe-assignment
          usage: {} as any,
          finishReason: "stop",
        },
      );
      expect(parsed).toEqual({ city: "SF" });
    });

    test("should treat text format 'text' as no output config", () => {
      const result = convertToResponsesTextCallOptions({
        input: "hi",
        text: { format: { type: "text" } },
      });
      expect(result.output).toBeUndefined();
    });

    test("should convert function tools to tool set", () => {
      const result = convertToResponsesTextCallOptions({
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

    test("should convert tool_choice auto/required/none", () => {
      expect(
        convertToResponsesTextCallOptions({ input: "hi", tool_choice: "auto" }).toolChoice,
      ).toBe("auto");
      expect(
        convertToResponsesTextCallOptions({ input: "hi", tool_choice: "required" }).toolChoice,
      ).toBe("required");
      expect(
        convertToResponsesTextCallOptions({ input: "hi", tool_choice: "none" }).toolChoice,
      ).toBe("none");
    });

    test("should convert named tool_choice", () => {
      const result = convertToResponsesTextCallOptions({
        input: "hi",
        tool_choice: { type: "function", name: "my_tool" },
      });
      expect(result.toolChoice).toEqual({ type: "tool", toolName: "my_tool" });
    });

    test("should map prompt_cache_key into providerOptions", () => {
      const result = convertToResponsesTextCallOptions({
        input: "hi",
        prompt_cache_key: "my-key",
      });

      expect(result.providerOptions).toEqual({
        unknown: { prompt_cache_key: "my-key" },
      });
    });

    test("should map service_tier into providerOptions", () => {
      const result = convertToResponsesTextCallOptions({
        input: "hi",
        service_tier: "priority",
      });

      expect(result.providerOptions).toEqual({
        unknown: { service_tier: "priority" },
      });
    });
  });

  describe("toResponses", () => {
    test("should produce a valid response object", () => {
      const result = toResponses(
        {
          finishReason: "stop",
          text: "Hello!",
          content: [{ type: "text", text: "Hello!" }],
          toolCalls: [],
          totalUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          warnings: [],
        } as unknown as GenerateTextResult<ToolSet, Output.Output>,
        "openai/gpt-5",
      );

      expect(result.id).toBeString();
      expect(result.object).toBe("response");
      expect(result.status).toBe("completed");
      expect(result.model).toBe("openai/gpt-5");
      expect(result.output).toHaveLength(1);
      expect(result.output[0]!.type).toBe("message");
      expect(result.usage).toEqual({
        input_tokens: 10,
        output_tokens: 5,
        total_tokens: 15,
      });
      expect(result.completed_at).toBeDefined();
    });

    test("should include tool call output items", () => {
      const result = toResponses(
        {
          finishReason: "tool-calls",
          text: "",
          content: [],
          toolCalls: [
            {
              toolCallId: "call_1",
              toolName: "get_weather",
              input: { city: "SF" },
            },
          ],
          totalUsage: { inputTokens: 15, outputTokens: 10, totalTokens: 25 },
          warnings: [],
        } as unknown as GenerateTextResult<ToolSet, Output.Output>,
        "openai/gpt-5",
      );

      expect(result.status).toBe("completed");
      const fnCall = result.output.find((o) => o.type === "function_call");
      expect(fnCall).toBeDefined();
      expect(fnCall!.type).toBe("function_call");
      if (fnCall!.type === "function_call") {
        expect(fnCall!.name).toBe("get_weather");
        expect(fnCall!.call_id).toBe("call_1");
        expect(fnCall!.arguments).toBe('{"city":"SF"}');
      }
    });

    test("should include reasoning output items", () => {
      const result = toResponses(
        {
          finishReason: "stop",
          text: "42",
          content: [
            { type: "reasoning", text: "Let me think..." },
            { type: "text", text: "42" },
          ],
          toolCalls: [],
          totalUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          warnings: [],
        } as unknown as GenerateTextResult<ToolSet, Output.Output>,
        "openai/gpt-5",
      );

      const reasoning = result.output.find((o) => o.type === "reasoning");
      expect(reasoning).toBeDefined();
      if (reasoning?.type === "reasoning") {
        expect(reasoning.summary[0]!.text).toBe("Let me think...");
      }
    });

    test("should set incomplete status for length finish reason", () => {
      const result = toResponses(
        {
          finishReason: "length",
          text: "Partial...",
          content: [{ type: "text", text: "Partial..." }],
          toolCalls: [],
          totalUsage: { inputTokens: 10, outputTokens: 100, totalTokens: 110 },
          warnings: [],
        } as unknown as GenerateTextResult<ToolSet, Output.Output>,
        "openai/gpt-5",
      );

      expect(result.status).toBe("incomplete");
      expect(result.incomplete_details).toEqual({ reason: "max_output_tokens" });
      expect(result.completed_at).toBeNull();
    });

    test("should set failed status for error finish reason", () => {
      const result = toResponses(
        {
          finishReason: "error",
          text: "",
          content: [],
          toolCalls: [],
          totalUsage: { inputTokens: 5, outputTokens: 0, totalTokens: 5 },
          warnings: [],
        } as unknown as GenerateTextResult<ToolSet, Output.Output>,
        "openai/gpt-5",
      );

      expect(result.status).toBe("failed");
    });

    test("should pass through metadata", () => {
      const result = toResponses(
        {
          finishReason: "stop",
          text: "Hi",
          content: [{ type: "text", text: "Hi" }],
          toolCalls: [],
          totalUsage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
          warnings: [],
        } as unknown as GenerateTextResult<ToolSet, Output.Output>,
        "openai/gpt-5",
        { user_id: "u-123" },
      );

      expect(result.metadata).toEqual({ user_id: "u-123" });
    });

    test("should normalize service_tier from providerMetadata", () => {
      const result = toResponses(
        {
          finishReason: "stop",
          text: "Hi",
          content: [{ type: "text", text: "Hi" }],
          toolCalls: [],
          totalUsage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
          warnings: [],
          providerMetadata: {
            openai: { service_tier: "flex" },
          },
        } as unknown as GenerateTextResult<ToolSet, Output.Output>,
        "openai/gpt-5",
      );

      expect(result.service_tier).toBe("flex");
    });
  });

  describe("toResponsesUsage", () => {
    test("should map basic token counts", () => {
      const usage = toResponsesUsage({
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      } as unknown as LanguageModelUsage);

      expect(usage).toEqual({
        input_tokens: 100,
        output_tokens: 50,
        total_tokens: 150,
      });
    });

    test("should include cached token details", () => {
      const usage = toResponsesUsage({
        inputTokens: 100,
        outputTokens: 20,
        totalTokens: 120,
        inputTokenDetails: {
          cacheReadTokens: 60,
          cacheWriteTokens: undefined,
          noCacheTokens: undefined,
        },
        outputTokenDetails: {
          textTokens: 20,
          reasoningTokens: 10,
        },
      } as unknown as LanguageModelUsage);

      expect(usage.input_tokens_details).toEqual({ cached_tokens: 60 });
      expect(usage.output_tokens_details).toEqual({ reasoning_tokens: 10 });
    });

    test("should default to 0 when tokens undefined", () => {
      const usage = toResponsesUsage({} as unknown as LanguageModelUsage);

      expect(usage.input_tokens).toBe(0);
      expect(usage.output_tokens).toBe(0);
      expect(usage.total_tokens).toBe(0);
    });
  });

  describe("ResponsesTransformStream", () => {
    test("should handle reasoning and text stream correctly", async () => {
      const { ResponsesTransformStream } = await import("./converters");

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue({
            type: "reasoning-start",
            id: "r1",
            providerMetadata: { unknown: { redactedData: "encrypted" } },
          });
          controller.enqueue({ type: "reasoning-delta", text: "Let me" });
          controller.enqueue({ type: "reasoning-delta", text: " think..." });
          controller.enqueue({ type: "reasoning-end", id: "r1" });
          controller.enqueue({ type: "text-start", id: "1" });
          controller.enqueue({ type: "text-delta", text: "Hello" });
          controller.enqueue({ type: "text-end", id: "1" });
          controller.enqueue({
            type: "finish",
            finishReason: "stop",
            totalUsage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
          });
          controller.close();
        },
      });

      const transformed = stream.pipeThrough(new ResponsesTransformStream("openai/gpt-5"));
      const reader = transformed.getReader();
      const events: { event: string; data: any }[] = [];

      // oxlint-disable-next-line no-await-in-loop
      while (true) {
        // oxlint-disable-next-line no-await-in-loop
        const { done, value } = await reader.read();
        if (done) break;
        if (value) events.push(value as { event: string; data: any });
      }

      // Initial events
      expect(events[0]!.event).toBe("response.created");
      expect(events[1]!.event).toBe("response.in_progress");

      // Reasoning
      const reasoningAdded = events.find(
        (e) =>
          e.event === "response.output_item.added" &&
          // oxlint-disable-next-line no-unsafe-member-access
          e.data.item.type === "reasoning",
      );
      expect(reasoningAdded).toBeDefined();
      // oxlint-disable-next-line no-unsafe-member-access
      expect(reasoningAdded!.data.item.encrypted_content).toBe("encrypted");

      const reasoningDeltas = events.filter(
        (e) => e.event === "response.reasoning_summary_text.delta",
      );
      expect(reasoningDeltas).toHaveLength(2);
      // oxlint-disable-next-line no-unsafe-member-access
      expect(reasoningDeltas[0]!.data.delta).toBe("Let me");
      // oxlint-disable-next-line no-unsafe-member-access
      expect(reasoningDeltas[1]!.data.delta).toBe(" think...");

      // Text
      const textAdded = events.find(
        (e) =>
          e.event === "response.output_item.added" &&
          // oxlint-disable-next-line no-unsafe-member-access
          e.data.item.type === "message",
      );
      expect(textAdded).toBeDefined();

      const textDeltas = events.filter((e) => e.event === "response.output_text.delta");
      expect(textDeltas).toHaveLength(1);
      // oxlint-disable-next-line no-unsafe-member-access
      expect(textDeltas[0]!.data.delta).toBe("Hello");

      // Final response
      const completed = events.find((e) => e.event === "response.completed");
      expect(completed).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      const completedResponse = (completed!.data as any).response;
      expect(completedResponse.status).toBe("completed");
      expect(completedResponse.output).toHaveLength(2);
      expect(completedResponse.output[0].type).toBe("reasoning");
      expect(completedResponse.output[1].type).toBe("message");
      expect(completedResponse.output[1].content[0].text).toBe("Hello");
    });
  });
});
