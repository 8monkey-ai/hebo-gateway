import { describe, expect, test } from "bun:test";

import type {
  GenerateTextResult,
  ToolSet,
  Output,
  LanguageModelUsage,
  UserModelMessage,
  FilePart,
  ToolModelMessage,
} from "ai";

import {
  convertToTextCallOptions,
  convertToModelMessages,
  toResponses,
  toResponsesUsage,
  ResponsesTransformStream,
} from "./converters";
import {
  type ResponsesInputItem,
  type ResponsesStreamEvent,
  type ResponseOutputItemAddedEvent,
  type ResponseReasoningSummaryTextDeltaEvent,
  type ResponseReasoningContentTextDeltaEvent,
  type ResponseOutputTextDeltaEvent,
  type ResponseCompletedEvent,
  type ResponseOutputItemDoneEvent,
  type ResponsesOutputItem,
  type ResponsesFunctionCall,
  type ResponsesOutputMessage,
  type ResponsesReasoningItem,
} from "./schema";

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

describe("Responses Converters", () => {
  describe("convertToModelMessages", () => {
    test("should convert string input to single user message", () => {
      const messages = convertToModelMessages("Hello world");
      expect(messages).toEqual([{ role: "user", content: "Hello world" }]);
    });

    test("should prepend instructions as system message", () => {
      const messages = convertToModelMessages("Hi", "You are a helpful assistant.");
      expect(messages).toEqual([
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hi" },
      ]);
    });

    test("should map cache_control into providerOptions for messages", () => {
      const messages = convertToModelMessages([
        {
          type: "message",
          role: "user",
          content: "Hello",
          cache_control: { type: "ephemeral" },
        },
      ] satisfies ResponsesInputItem[]);
      expect(messages).toEqual([
        {
          role: "user",
          content: "Hello",
          providerOptions: { unknown: { cache_control: { type: "ephemeral" } } },
        },
      ]);
    });

    test("should preserve extra_content and cache_control on message items", () => {
      const messages = convertToModelMessages([
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "Hello!" }],
          cache_control: { type: "ephemeral" },
          extra_content: { google: { thought: "thinking..." } },
        },
      ] satisfies ResponsesInputItem[]);
      expect(messages[0]).toEqual({
        role: "assistant",
        content: [{ type: "text", text: "Hello!" }],
        providerOptions: {
          google: { thought: "thinking..." },
          unknown: { cache_control: { type: "ephemeral" } },
        },
      });
    });

    test("should convert message items to model messages", () => {
      const messages = convertToModelMessages([
        {
          type: "message",
          role: "user",
          content: "What is the weather?",
        },
      ] satisfies ResponsesInputItem[]);
      expect(messages).toEqual([{ role: "user", content: "What is the weather?" }]);
    });

    test("should convert system and developer messages to system role", () => {
      const messages = convertToModelMessages([
        { type: "message", role: "system", content: "System prompt" },
        { type: "message", role: "developer", content: "Dev prompt" },
        { type: "message", role: "user", content: "Hi" },
      ] satisfies ResponsesInputItem[]);
      expect(messages[0]).toEqual({ role: "system", content: "System prompt" });
      expect(messages[1]).toEqual({ role: "system", content: "Dev prompt" });
      expect(messages[2]).toEqual({ role: "user", content: "Hi" });
    });

    test("should convert assistant message with output_text content", () => {
      const messages = convertToModelMessages([
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "Hello!" }],
        },
      ] satisfies ResponsesInputItem[]);
      expect(messages).toEqual([
        { role: "assistant", content: [{ type: "text", text: "Hello!" }] },
      ]);
    });

    test("should convert function_call and function_call_output items", () => {
      const messages = convertToModelMessages([
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
      ] satisfies ResponsesInputItem[]);

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

    test("should convert reasoning items to assistant messages from summary", () => {
      const messages = convertToModelMessages([
        {
          type: "reasoning",
          summary: [{ type: "summary_text", text: "I'm thinking..." }],
        },
        { type: "message", role: "user", content: "Hi" },
      ] satisfies ResponsesInputItem[]);
      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual({
        role: "assistant",
        content: [{ type: "reasoning", text: "I'm thinking...", providerOptions: undefined }],
      });
      expect(messages[1]).toEqual({ role: "user", content: "Hi" });
    });

    test("should prefer content over summary in reasoning items", () => {
      const messages = convertToModelMessages([
        {
          type: "reasoning",
          summary: [{ type: "summary_text", text: "Short summary" }],
          content: [{ type: "reasoning_text", text: "Full detailed thinking..." }],
        },
      ] satisfies ResponsesInputItem[]);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({
        role: "assistant",
        content: [
          { type: "reasoning", text: "Full detailed thinking...", providerOptions: undefined },
        ],
      });
    });

    test("should pass signature through providerOptions on reasoning items", () => {
      const messages = convertToModelMessages([
        {
          type: "reasoning",
          summary: [{ type: "summary_text", text: "Thinking..." }],
          content: [{ type: "reasoning_text", text: "Thinking..." }],
          signature: "sig-abc123",
        },
      ] satisfies ResponsesInputItem[]);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({
        role: "assistant",
        content: [
          {
            type: "reasoning",
            text: "Thinking...",
            providerOptions: { unknown: { signature: "sig-abc123" } },
          },
        ],
      });
    });

    test("should convert user message with input content parts", () => {
      const messages = convertToModelMessages([
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Describe this image" }],
        },
      ] satisfies ResponsesInputItem[]);
      expect(messages).toEqual([
        {
          role: "user",
          content: [{ type: "text", text: "Describe this image" }],
        },
      ]);
    });

    test("should convert user message with input audio content part", () => {
      const messages = convertToModelMessages([
        {
          type: "message",
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
      ] satisfies ResponsesInputItem[]);

      expect(messages).toHaveLength(1);
      const userMessage = messages[0] as UserModelMessage;
      expect(userMessage.role).toBe("user");
      expect(Array.isArray(userMessage.content)).toBe(true);

      const content = userMessage.content as Array<{ type: string }>;
      const part = content[0] as FilePart;
      expect(part.type).toBe("file");
      expect(part.mediaType).toBe("audio/wav");
      expect(part.data).toBeInstanceOf(Uint8Array);
      expect(Array.from(part.data as Uint8Array)).toEqual([104, 101, 108, 108, 111]);
    });

    test("should convert function_call_output items with audio", () => {
      const messages = convertToModelMessages([
        {
          type: "function_call",
          call_id: "call_1",
          name: "get_audio",
          arguments: "{}",
        },
        {
          type: "function_call_output",
          call_id: "call_1",
          output: [
            {
              type: "input_audio",
              input_audio: {
                data: "aGVsbG8=",
                format: "wav",
              },
            },
          ],
        },
      ] satisfies ResponsesInputItem[]);

      expect(messages).toHaveLength(2);
      const toolMessage = messages[1] as ToolModelMessage;
      expect(toolMessage.role).toBe("tool");
      expect(toolMessage.content[0]).toEqual({
        type: "tool-result",
        toolCallId: "call_1",
        toolName: "get_audio",
        output: {
          type: "content",
          value: [
            {
              type: "file-data",
              data: "aGVsbG8=",
              mediaType: "audio/wav",
            },
          ],
        },
      });
    });
  });

  describe("convertToTextCallOptions", () => {
    test("should pass parallel_tool_calls in providerOptions", () => {
      const result = convertToTextCallOptions({
        input: "hi",
        parallel_tool_calls: false,
      });
      expect(result.providerOptions["unknown"]).toMatchObject({
        parallel_tool_calls: false,
      });
    });

    test("should set temperature and top_p", () => {
      const result = convertToTextCallOptions({
        input: "hi",
        temperature: 0.7,
        top_p: 0.9,
      });
      expect(result.temperature).toBe(0.7);
      expect(result.topP).toBe(0.9);
    });

    test("should set max_output_tokens", () => {
      const result = convertToTextCallOptions({
        input: "hi",
        max_output_tokens: 500,
      });
      expect(result.maxOutputTokens).toBe(500);
    });

    test("should set stopWhen from max_tool_calls", () => {
      const result = convertToTextCallOptions({
        input: "hi",
        max_tool_calls: 3,
      });
      // The function stepCountIs returns a function, we just check if it's defined
      expect(result.stopWhen).toBeDefined();
      expect(typeof result.stopWhen).toBe("function");
    });

    test("should set frequency_penalty and presence_penalty", () => {
      const result = convertToTextCallOptions({
        input: "hi",
        frequency_penalty: 0.5,
        presence_penalty: -0.5,
      });
      expect(result.frequencyPenalty).toBe(0.5);
      expect(result.presencePenalty).toBe(-0.5);
    });

    test("should convert text json_schema format to output", async () => {
      const result = convertToTextCallOptions({
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

      const parsed: unknown = await result.output!.parseCompleteOutput(
        { text: '{"city":"SF"}' },
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
      expect(parsed).toEqual({ city: "SF" });
    });

    test("should treat text format 'text' as no output config", () => {
      const result = convertToTextCallOptions({
        input: "hi",
        text: { format: { type: "text" } },
      });
      expect(result.output).toBeUndefined();
    });

    test("should convert function tools to tool set", () => {
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

    test("should convert tool_choice auto/required/none", () => {
      expect(convertToTextCallOptions({ input: "hi", tool_choice: "auto" }).toolChoice).toBe(
        "auto",
      );
      expect(convertToTextCallOptions({ input: "hi", tool_choice: "required" }).toolChoice).toBe(
        "required",
      );
      expect(convertToTextCallOptions({ input: "hi", tool_choice: "none" }).toolChoice).toBe(
        "none",
      );
    });

    test("should convert named tool_choice", () => {
      const result = convertToTextCallOptions({
        input: "hi",
        tool_choice: { type: "function", name: "my_tool" },
      });
      expect(result.toolChoice).toEqual({ type: "tool", toolName: "my_tool" });
    });

    test("should map prompt_cache_key into providerOptions", () => {
      const result = convertToTextCallOptions({
        input: "hi",
        prompt_cache_key: "my-key",
      });

      expect(result.providerOptions).toEqual({
        unknown: { prompt_cache_key: "my-key" },
      });
    });

    test("should map service_tier into providerOptions", () => {
      const result = convertToTextCallOptions({
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
        mockGenerateTextResult({
          finishReason: "stop",
          text: "Hello!",
          content: [{ type: "text", text: "Hello!" }],
          usage: mockUsage({ inputTokens: 10, outputTokens: 5, totalTokens: 15 }),
          totalUsage: mockUsage({ inputTokens: 10, outputTokens: 5, totalTokens: 15 }),
        }),
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
        mockGenerateTextResult({
          finishReason: "tool-calls",
          toolCalls: [
            {
              type: "tool-call",
              toolCallId: "call_1",
              toolName: "get_weather",
              input: { city: "SF" },
            },
          ],
          usage: mockUsage({ inputTokens: 15, outputTokens: 10, totalTokens: 25 }),
          totalUsage: mockUsage({ inputTokens: 15, outputTokens: 10, totalTokens: 25 }),
        }),
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

    test("should include reasoning output items with both summary and content", () => {
      const result = toResponses(
        mockGenerateTextResult({
          finishReason: "stop",
          text: "42",
          content: [
            { type: "reasoning", text: "Let me think..." },
            { type: "text", text: "42" },
          ],
          usage: mockUsage({ inputTokens: 10, outputTokens: 5, totalTokens: 15 }),
          totalUsage: mockUsage({ inputTokens: 10, outputTokens: 5, totalTokens: 15 }),
        }),
        "openai/gpt-5",
      );

      const reasoning = result.output.find((o) => o.type === "reasoning");
      expect(reasoning).toBeDefined();
      if (reasoning?.type === "reasoning") {
        expect(reasoning.summary[0]!.text).toBe("Let me think...");
        expect(reasoning.content).toBeDefined();
        expect(reasoning.content![0]!.type).toBe("reasoning_text");
        expect(reasoning.content![0]!.text).toBe("Let me think...");
      }
    });

    test("should surface signature on reasoning output items", () => {
      const result = toResponses(
        mockGenerateTextResult({
          finishReason: "stop",
          text: "42",
          content: [
            {
              type: "reasoning",
              text: "Thinking...",
              providerMetadata: { anthropic: { signature: "sig-abc123" } },
            },
            { type: "text", text: "42" },
          ],
          usage: mockUsage({ inputTokens: 10, outputTokens: 5, totalTokens: 15 }),
          totalUsage: mockUsage({ inputTokens: 10, outputTokens: 5, totalTokens: 15 }),
        }),
        "anthropic/claude-4-opus",
      );

      const reasoning = result.output.find(
        (o): o is ResponsesReasoningItem => o.type === "reasoning",
      );
      expect(reasoning).toBeDefined();
      expect(reasoning!.signature).toBe("sig-abc123");
    });

    test("should set incomplete status for length finish reason", () => {
      const result = toResponses(
        mockGenerateTextResult({
          finishReason: "length",
          text: "Partial...",
          content: [{ type: "text", text: "Partial..." }],
          usage: mockUsage({ inputTokens: 10, outputTokens: 100, totalTokens: 110 }),
          totalUsage: mockUsage({ inputTokens: 10, outputTokens: 100, totalTokens: 110 }),
        }),
        "openai/gpt-5",
      );

      expect(result.status).toBe("incomplete");
      expect(result.incomplete_details).toEqual({ reason: "max_output_tokens" });
      expect(result.completed_at).toBeNull();
    });

    test("should set failed status for error finish reason", () => {
      const result = toResponses(
        mockGenerateTextResult({
          finishReason: "error",
          usage: mockUsage({ inputTokens: 5, outputTokens: 0, totalTokens: 5 }),
          totalUsage: mockUsage({ inputTokens: 5, outputTokens: 0, totalTokens: 5 }),
        }),
        "openai/gpt-5",
      );

      expect(result.status).toBe("failed");
    });

    test("should pass through metadata", () => {
      const result = toResponses(
        mockGenerateTextResult({
          finishReason: "stop",
          text: "Hi",
          content: [{ type: "text", text: "Hi" }],
          usage: mockUsage({ inputTokens: 5, outputTokens: 2, totalTokens: 7 }),
          totalUsage: mockUsage({ inputTokens: 5, outputTokens: 2, totalTokens: 7 }),
        }),
        "openai/gpt-5",
        { user_id: "u-123" },
      );

      expect(result.metadata).toEqual({ user_id: "u-123" });
    });

    test("should normalize service_tier from providerMetadata", () => {
      const result = toResponses(
        mockGenerateTextResult({
          finishReason: "stop",
          text: "Hi",
          content: [{ type: "text", text: "Hi" }],
          usage: mockUsage({ inputTokens: 5, outputTokens: 2, totalTokens: 7 }),
          totalUsage: mockUsage({ inputTokens: 5, outputTokens: 2, totalTokens: 7 }),
          providerMetadata: {
            openai: { service_tier: "flex" },
          },
        }),
        "openai/gpt-5",
      );

      expect(result.service_tier).toBe("flex");
    });
  });

  describe("toResponsesUsage", () => {
    test("should map basic token counts", () => {
      const usage = toResponsesUsage(
        mockUsage({
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
        }),
      );

      expect(usage).toEqual({
        input_tokens: 100,
        output_tokens: 50,
        total_tokens: 150,
      });
    });

    test("should include cached token details", () => {
      const usage = toResponsesUsage(
        mockUsage({
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
        }),
      );

      expect(usage.input_tokens_details).toEqual({ cached_tokens: 60 });
      expect(usage.output_tokens_details).toEqual({ reasoning_tokens: 10 });
    });

    test("should calculate total_tokens when totalTokens is missing", () => {
      const usage = toResponsesUsage(
        mockUsage({
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: undefined,
        }),
      );

      expect(usage.total_tokens).toBe(15);
    });
  });

  describe("ResponsesTransformStream", () => {
    test("should handle reasoning and text stream correctly", async () => {
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
            totalUsage: mockUsage({ inputTokens: 5, outputTokens: 5, totalTokens: 10 }),
          });
          controller.close();
        },
      });

      const transformed = stream.pipeThrough(new ResponsesTransformStream("openai/gpt-5"));
      const reader = transformed.getReader();
      const events: ResponsesStreamEvent[] = [];

      while (true) {
        // oxlint-disable-next-line no-await-in-loop
        const { done, value } = await reader.read();
        if (done) break;
        if (value && "event" in (value as object)) {
          events.push(value as ResponsesStreamEvent);
        }
      }

      // Initial events
      expect(events[0]!.event).toBe("response.created");
      expect(events[1]!.event).toBe("response.in_progress");

      // Reasoning
      const reasoningAdded = events.find(
        (e): e is ResponseOutputItemAddedEvent =>
          e.event === "response.output_item.added" && e.data.item.type === "reasoning",
      );
      expect(reasoningAdded).toBeDefined();
      expect(
        (reasoningAdded!.data.item as Extract<ResponsesOutputItem, { type: "reasoning" }>)
          .encrypted_content,
      ).toBe("encrypted");

      const reasoningDeltas = events.filter(
        (e): e is ResponseReasoningSummaryTextDeltaEvent =>
          e.event === "response.reasoning_summary_text.delta",
      );
      expect(reasoningDeltas).toHaveLength(2);
      expect(reasoningDeltas[0]!.data.delta).toBe("Let me");
      expect(reasoningDeltas[1]!.data.delta).toBe(" think...");

      // Content deltas (parallel to summary)
      const contentDeltas = events.filter(
        (e): e is ResponseReasoningContentTextDeltaEvent =>
          e.event === "response.reasoning_content_text.delta",
      );
      expect(contentDeltas).toHaveLength(2);
      expect(contentDeltas[0]!.data.delta).toBe("Let me");
      expect(contentDeltas[1]!.data.delta).toBe(" think...");

      // Content part lifecycle events
      const contentPartAdded = events.filter(
        (e) => e.event === "response.reasoning_content_part.added",
      );
      expect(contentPartAdded).toHaveLength(1);

      const contentPartDone = events.filter(
        (e) => e.event === "response.reasoning_content_part.done",
      );
      expect(contentPartDone).toHaveLength(1);

      // Text
      const textAdded = events.find(
        (e): e is ResponseOutputItemAddedEvent =>
          e.event === "response.output_item.added" && e.data.item.type === "message",
      );
      expect(textAdded).toBeDefined();

      const textDeltas = events.filter(
        (e): e is ResponseOutputTextDeltaEvent => e.event === "response.output_text.delta",
      );
      expect(textDeltas).toHaveLength(1);
      expect(textDeltas[0]!.data.delta).toBe("Hello");

      // Final response
      const completed = events.find(
        (e): e is ResponseCompletedEvent => e.event === "response.completed",
      );
      expect(completed).toBeDefined();
      const completedResponse = completed!.data.response;
      expect(completedResponse.status).toBe("completed");
      expect(completedResponse.output).toHaveLength(2);
      expect(completedResponse.output[0]!.type).toBe("reasoning");
      const completedReasoning = completedResponse.output[0] as ResponsesReasoningItem;
      expect(completedReasoning.summary[0]!.text).toBe("Let me think...");
      expect(completedReasoning.content).toBeDefined();
      expect(completedReasoning.content![0]!.text).toBe("Let me think...");
      expect(completedResponse.output[1]!.type).toBe("message");
      expect((completedResponse.output[1] as ResponsesOutputMessage).content[0]!.text).toBe(
        "Hello",
      );
    });

    test("should surface signature on streamed reasoning items", async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue({
            type: "reasoning-start",
            id: "r1",
            providerMetadata: { anthropic: { signature: "sig-stream123" } },
          });
          controller.enqueue({ type: "reasoning-delta", text: "Thinking" });
          controller.enqueue({ type: "reasoning-end", id: "r1" });
          controller.enqueue({
            type: "finish",
            finishReason: "stop",
            totalUsage: mockUsage({ inputTokens: 5, outputTokens: 5, totalTokens: 10 }),
          });
          controller.close();
        },
      });

      const transformed = stream.pipeThrough(new ResponsesTransformStream("anthropic/claude-4"));
      const reader = transformed.getReader();
      const events: ResponsesStreamEvent[] = [];

      while (true) {
        // oxlint-disable-next-line no-await-in-loop
        const { done, value } = await reader.read();
        if (done) break;
        if (value && "event" in (value as object)) {
          events.push(value as ResponsesStreamEvent);
        }
      }

      const reasoningAdded = events.find(
        (e): e is ResponseOutputItemAddedEvent =>
          e.event === "response.output_item.added" && e.data.item.type === "reasoning",
      );
      expect(reasoningAdded).toBeDefined();
      expect((reasoningAdded!.data.item as ResponsesReasoningItem).signature).toBe("sig-stream123");

      const completed = events.find(
        (e): e is ResponseCompletedEvent => e.event === "response.completed",
      );
      const completedReasoning = completed!.data.response.output[0] as ResponsesReasoningItem;
      expect(completedReasoning.signature).toBe("sig-stream123");
    });

    test("should carry final tool-call metadata onto the streamed item when inProgress", async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue({
            type: "tool-input-start",
            id: "call_1",
            toolName: "test_tool",
            providerMetadata: { test: { initial: "metadata" } },
          });
          controller.enqueue({
            type: "tool-input-delta",
            id: "call_1",
            delta: '{"arg":',
          });
          controller.enqueue({
            type: "tool-call",
            toolCallId: "call_1",
            toolName: "test_tool",
            input: { arg: "value" },
            providerMetadata: { test: { final: "metadata" } },
          });
          controller.enqueue({
            type: "finish",
            finishReason: "stop",
          });
          controller.close();
        },
      });

      const transformed = stream.pipeThrough(new ResponsesTransformStream("test-model"));
      const reader = transformed.getReader();
      const events: ResponsesStreamEvent[] = [];

      while (true) {
        // oxlint-disable-next-line no-await-in-loop
        const { done, value } = await reader.read();
        if (done) break;
        if (value && "event" in (value as object)) {
          events.push(value as ResponsesStreamEvent);
        }
      }

      const toolCallDoneEvent = events.find(
        (e): e is ResponseOutputItemDoneEvent =>
          e.event === "response.output_item.done" && e.data.item.type === "function_call",
      );

      expect(toolCallDoneEvent).toBeDefined();
      const item = toolCallDoneEvent!.data.item as ResponsesFunctionCall;
      expect(item.extra_content).toEqual({ test: { final: "metadata" } });
    });
  });
});
