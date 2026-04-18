import { describe, expect, test } from "bun:test";

import type { GenerateTextResult, ToolSet, Output, LanguageModelUsage, TextStreamPart } from "ai";

import {
  convertToTextCallOptions,
  convertToModelMessages,
  convertToToolSet,
  convertToToolChoiceOptions,
  toMessages,
  mapStopReason,
  mapUsage,
  MessagesTransformStream,
} from "./converters";
import type { MessagesStreamEvent } from "./schema";

async function collectStreamEvents(
  stream: ReadableStream<MessagesStreamEvent>,
): Promise<{ events: MessagesStreamEvent[]; all: unknown[] }> {
  const events: MessagesStreamEvent[] = [];
  const all: unknown[] = [];
  for await (const value of stream) {
    all.push(value);
    events.push(value);
  }
  return { events, all };
}

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

describe("Messages Converters", () => {
  describe("convertToModelMessages", () => {
    test("should convert user message with string content", () => {
      const messages = convertToModelMessages([{ role: "user", content: "Hello world" }]);
      expect(messages).toEqual([{ role: "user", content: "Hello world" }]);
    });

    test("should prepend system as string", () => {
      const messages = convertToModelMessages(
        [{ role: "user", content: "Hi" }],
        "You are helpful.",
      );
      expect(messages).toEqual([
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Hi" },
      ]);
    });

    test("should prepend system as array of text blocks", () => {
      const messages = convertToModelMessages(
        [{ role: "user", content: "Hi" }],
        [
          { type: "text", text: "You are " },
          { type: "text", text: "helpful." },
        ],
      );
      expect(messages).toEqual([
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Hi" },
      ]);
    });

    test("should apply cache_control from system blocks", () => {
      const messages = convertToModelMessages(
        [{ role: "user", content: "Hi" }],
        [{ type: "text", text: "System prompt", cache_control: { type: "ephemeral" } }],
      );
      expect(messages[0]).toEqual({
        role: "system",
        content: "System prompt",
        providerOptions: { unknown: { cache_control: { type: "ephemeral" } } },
      });
    });

    test("should convert user message with text content block", () => {
      const messages = convertToModelMessages([
        {
          role: "user",
          content: [{ type: "text", text: "Describe this" }],
        },
      ]);
      expect(messages).toEqual([
        {
          role: "user",
          content: [{ type: "text", text: "Describe this" }],
        },
      ]);
    });

    test("should convert user message with text block cache_control", () => {
      const messages = convertToModelMessages([
        {
          role: "user",
          content: [{ type: "text", text: "cached", cache_control: { type: "ephemeral" } }],
        },
      ]);
      expect(messages).toEqual([
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "cached",
              providerOptions: { unknown: { cache_control: { type: "ephemeral" } } },
            },
          ],
        },
      ]);
    });

    test("should convert image block with base64 source", () => {
      const messages = convertToModelMessages([
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/png", data: "aGVsbG8=" },
            },
          ],
        },
      ]);
      expect(messages).toHaveLength(1);
      const content = (messages[0] as { content: unknown[] }).content;
      expect(content).toHaveLength(1);
      const part = content[0] as { type: string; mediaType: string };
      expect(part.type).toBe("image");
      expect(part.mediaType).toBe("image/png");
    });

    test("should convert image block with URL source", () => {
      const messages = convertToModelMessages([
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "url", url: "https://example.com/image.png" },
            },
          ],
        },
      ]);
      expect(messages).toHaveLength(1);
      const content = (messages[0] as { content: unknown[] }).content;
      expect(content).toHaveLength(1);
      const part = content[0] as { type: string };
      expect(part.type).toBe("image");
    });

    test("should convert document block with base64 source", () => {
      const messages = convertToModelMessages([
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: "aGVsbG8=" },
            },
          ],
        },
      ]);
      const content = (messages[0] as { content: unknown[] }).content;
      const part = content[0] as { type: string; mediaType: string };
      expect(part.type).toBe("file");
      expect(part.mediaType).toBe("application/pdf");
    });

    test("should convert document block with URL source", () => {
      const messages = convertToModelMessages([
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "url", url: "https://example.com/doc.pdf" },
            },
          ],
        },
      ]);
      const content = (messages[0] as { content: unknown[] }).content;
      const part = content[0] as { type: string; mediaType: string };
      expect(part.type).toBe("file");
      expect(part.mediaType).toBe("application/octet-stream");
    });

    test("should convert document block with text source", () => {
      const messages = convertToModelMessages([
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "text", data: "Document content here", media_type: "text/plain" },
            },
          ],
        },
      ]);
      const content = (messages[0] as { content: unknown[] }).content;
      expect(content[0]).toEqual({ type: "text", text: "Document content here" });
    });

    test("should convert tool_result block", () => {
      const messages = convertToModelMessages([
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tool_1",
              content: '{"temp":72}',
            },
          ],
        },
      ]);
      // tool_result produces a tool message
      const toolMsg = messages.find((m) => m.role === "tool");
      expect(toolMsg).toBeDefined();
      const toolContent = (toolMsg as { content: unknown[] }).content;
      expect(toolContent[0]).toEqual({
        type: "tool-result",
        toolCallId: "tool_1",
        toolName: "",
        output: { type: "json", value: { temp: 72 } },
      });
    });

    test("should convert tool_result block with undefined content", () => {
      const messages = convertToModelMessages([
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tool_1",
            },
          ],
        },
      ]);
      const toolMsg = messages.find((m) => m.role === "tool");
      expect(toolMsg).toBeDefined();
      const toolContent = (toolMsg as { content: unknown[] }).content;
      expect(toolContent[0]).toMatchObject({
        type: "tool-result",
        toolCallId: "tool_1",
        output: { type: "text", value: "" },
      });
    });

    test("should convert tool_result block with array content", () => {
      const messages = convertToModelMessages([
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tool_1",
              content: [{ type: "text", text: "result text" }],
            },
          ],
        },
      ]);
      const toolMsg = messages.find((m) => m.role === "tool");
      const toolContent = (toolMsg as { content: unknown[] }).content;
      expect(toolContent[0]).toMatchObject({
        type: "tool-result",
        toolCallId: "tool_1",
        output: { type: "content", value: [{ type: "text", text: "result text" }] },
      });
    });

    test("should convert tool_result block with image content", () => {
      const messages = convertToModelMessages([
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tool_1",
              content: [
                { type: "text", text: "Here is the image:" },
                {
                  type: "image",
                  source: { type: "base64", media_type: "image/png", data: "aGVsbG8=" },
                },
              ],
            },
          ],
        },
      ]);
      const toolMsg = messages.find((m) => m.role === "tool");
      const toolContent = (toolMsg as { content: unknown[] }).content;
      const output = (toolContent[0] as Record<string, unknown>)["output"] as {
        type: string;
        value: unknown[];
      };
      expect(output.type).toBe("content");
      expect(output.value).toHaveLength(2);
      expect((output.value[0] as { type: string }).type).toBe("text");
      expect((output.value[1] as { type: string }).type).toBe("image-data");
    });

    test("should apply cache_control on tool_result block", () => {
      const messages = convertToModelMessages([
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tool_1",
              content: "ok",
              cache_control: { type: "ephemeral" },
            },
          ],
        },
      ]);
      const toolMsg = messages.find((m) => m.role === "tool");
      const toolContent = (toolMsg as { content: unknown[] }).content;
      expect((toolContent[0] as Record<string, unknown>)["providerOptions"]).toEqual({
        unknown: { cache_control: { type: "ephemeral" } },
      });
    });

    test("should convert assistant message with string content", () => {
      const messages = convertToModelMessages([{ role: "assistant", content: "Hello!" }]);
      expect(messages).toEqual([{ role: "assistant", content: "Hello!" }]);
    });

    test("should convert assistant message with text block", () => {
      const messages = convertToModelMessages([
        {
          role: "assistant",
          content: [{ type: "text", text: "Hello!" }],
        },
      ]);
      expect(messages).toEqual([
        { role: "assistant", content: [{ type: "text", text: "Hello!" }] },
      ]);
    });

    test("should convert assistant message with tool_use block", () => {
      const messages = convertToModelMessages([
        {
          role: "assistant",
          content: [{ type: "tool_use", id: "call_1", name: "get_weather", input: { city: "SF" } }],
        },
      ]);
      expect(messages).toEqual([
        {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolCallId: "call_1",
              toolName: "get_weather",
              input: { city: "SF" },
            },
          ],
        },
      ]);
    });

    test("should convert assistant message with thinking block", () => {
      const messages = convertToModelMessages([
        {
          role: "assistant",
          content: [{ type: "thinking", thinking: "Let me think...", signature: "sig123" }],
        },
      ]);
      expect(messages).toEqual([
        {
          role: "assistant",
          content: [
            {
              type: "reasoning",
              text: "Let me think...",
              providerOptions: { unknown: { signature: "sig123" } },
            },
          ],
        },
      ]);
    });

    test("should convert assistant message with redacted_thinking block", () => {
      const messages = convertToModelMessages([
        {
          role: "assistant",
          content: [{ type: "redacted_thinking", data: "encrypted_data" }],
        },
      ]);
      expect(messages).toEqual([
        {
          role: "assistant",
          content: [
            {
              type: "reasoning",
              text: "",
              providerOptions: { unknown: { redactedData: "encrypted_data" } },
            },
          ],
        },
      ]);
    });

    test("should return empty string content for assistant with empty blocks", () => {
      const messages = convertToModelMessages([{ role: "assistant", content: [] }]);
      expect(messages).toEqual([{ role: "assistant", content: "" }]);
    });

    test("should handle mixed user content with text and tool_result", () => {
      const messages = convertToModelMessages([
        {
          role: "user",
          content: [
            { type: "text", text: "Here is the result:" },
            { type: "tool_result", tool_use_id: "tool_1", content: "done" },
          ],
        },
      ]);
      // Should produce both a user message and a tool message
      expect(messages).toHaveLength(2);
      expect(messages[0]!.role).toBe("user");
      expect(messages[1]!.role).toBe("tool");
    });
  });

  describe("convertToToolSet", () => {
    test("should return undefined for undefined tools", () => {
      // oxlint-disable-next-line no-useless-undefined
      expect(convertToToolSet(undefined)).toBeUndefined();
    });

    test("should return undefined for empty array", () => {
      expect(convertToToolSet([])).toBeUndefined();
    });

    test("should convert valid tools", () => {
      const toolSet = convertToToolSet([
        {
          name: "get_weather",
          description: "Get weather",
          input_schema: {
            type: "object",
            properties: { city: { type: "string" } },
          },
        },
      ]);
      expect(toolSet).toBeDefined();
      expect(Object.keys(toolSet!)).toEqual(["get_weather"]);
    });

    test("should convert multiple tools", () => {
      const toolSet = convertToToolSet([
        { name: "tool_a", input_schema: { type: "object", properties: {} } },
        { name: "tool_b", input_schema: { type: "object", properties: {} } },
      ]);
      expect(Object.keys(toolSet!)).toEqual(["tool_a", "tool_b"]);
    });

    test("should pass strict option to tool", () => {
      const toolSet = convertToToolSet([
        {
          name: "strict_tool",
          description: "A strict tool",
          input_schema: { type: "object", properties: { x: { type: "string" } } },
          strict: true,
        },
      ]);
      expect(toolSet).toBeDefined();
      expect(Object.keys(toolSet!)).toEqual(["strict_tool"]);
    });
  });

  describe("convertToToolChoiceOptions", () => {
    test("should return undefined for undefined", () => {
      // oxlint-disable-next-line no-useless-undefined
      expect(convertToToolChoiceOptions(undefined)).toBeUndefined();
    });

    test("should map auto to auto", () => {
      expect(convertToToolChoiceOptions({ type: "auto" })).toBe("auto");
    });

    test("should map any to required", () => {
      expect(convertToToolChoiceOptions({ type: "any" })).toBe("required");
    });

    test("should map none to none", () => {
      expect(convertToToolChoiceOptions({ type: "none" })).toBe("none");
    });

    test("should map tool to specific tool choice", () => {
      expect(convertToToolChoiceOptions({ type: "tool", name: "my_tool" })).toEqual({
        type: "tool",
        toolName: "my_tool",
      });
    });
  });

  describe("mapStopReason", () => {
    test("should map stop to end_turn", () => {
      expect(mapStopReason("stop")).toBe("end_turn");
    });

    test("should map tool-calls to tool_use", () => {
      expect(mapStopReason("tool-calls")).toBe("tool_use");
    });

    test("should map length to max_tokens", () => {
      expect(mapStopReason("length")).toBe("max_tokens");
    });

    test("should map content-filter to end_turn", () => {
      expect(mapStopReason("content-filter")).toBe("end_turn");
    });

    test("should map error to null", () => {
      expect(mapStopReason("error")).toBeNull();
    });

    test("should map other to null", () => {
      expect(mapStopReason("other")).toBeNull();
    });

    test("should map unknown to null", () => {
      expect(mapStopReason("unknown" as never)).toBeNull();
    });
  });

  describe("mapUsage", () => {
    test("should map basic usage", () => {
      const usage = mapUsage(mockUsage({ inputTokens: 100, outputTokens: 50 }));
      expect(usage).toEqual({ input_tokens: 100, output_tokens: 50 });
    });

    test("should default to zeros when usage is undefined", () => {
      const usage = mapUsage();
      expect(usage).toEqual({ input_tokens: 0, output_tokens: 0 });
    });

    test("should include cache write tokens from inputTokenDetails", () => {
      const usage = mapUsage(
        mockUsage({
          inputTokens: 100,
          outputTokens: 50,
          inputTokenDetails: {
            cacheWriteTokens: 30,
            cacheReadTokens: undefined,
            noCacheTokens: undefined,
          },
        }),
      );
      expect(usage.cache_creation_input_tokens).toBe(30);
    });

    test("should include cache read tokens from inputTokenDetails", () => {
      const usage = mapUsage(
        mockUsage({
          inputTokens: 100,
          outputTokens: 50,
          inputTokenDetails: {
            cacheReadTokens: 60,
            cacheWriteTokens: undefined,
            noCacheTokens: undefined,
          },
        }),
      );
      expect(usage.cache_read_input_tokens).toBe(60);
    });

    test("should include both cache write and read tokens from inputTokenDetails", () => {
      const usage = mapUsage(
        mockUsage({
          inputTokens: 100,
          outputTokens: 50,
          inputTokenDetails: {
            cacheReadTokens: 60,
            cacheWriteTokens: 10,
            noCacheTokens: undefined,
          },
        }),
      );
      expect(usage.cache_creation_input_tokens).toBe(10);
      expect(usage.cache_read_input_tokens).toBe(60);
    });
  });

  describe("toMessages", () => {
    test("should produce a valid message response with text", () => {
      const result = toMessages(
        mockGenerateTextResult({
          finishReason: "stop",
          text: "Hello!",
          content: [{ type: "text", text: "Hello!" }],
          usage: mockUsage({ inputTokens: 10, outputTokens: 5 }),
          totalUsage: mockUsage({ inputTokens: 10, outputTokens: 5 }),
        }),
        "anthropic/claude-3",
      );

      expect(result.id).toBeString();
      expect(result.id).toStartWith("msg_");
      expect(result.type).toBe("message");
      expect(result.role).toBe("assistant");
      expect(result.model).toBe("anthropic/claude-3");
      expect(result.stop_reason).toBe("end_turn");
      expect(result.stop_sequence).toBeNull();
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({ type: "text", text: "Hello!" });
      expect(result.usage).toEqual({ input_tokens: 10, output_tokens: 5 });
    });

    test("should include tool use blocks", () => {
      const result = toMessages(
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
          usage: mockUsage({ inputTokens: 15, outputTokens: 10 }),
          totalUsage: mockUsage({ inputTokens: 15, outputTokens: 10 }),
        }),
        "anthropic/claude-3",
      );

      expect(result.stop_reason).toBe("tool_use");
      const toolUse = result.content.find((c) => c.type === "tool_use");
      expect(toolUse).toBeDefined();
      if (toolUse?.type === "tool_use") {
        expect(toolUse.id).toBe("call_1");
        expect(toolUse.name).toBe("get_weather");
        expect(toolUse.input).toEqual({ city: "SF" });
      }
    });

    test("should include thinking blocks", () => {
      const result = toMessages(
        mockGenerateTextResult({
          finishReason: "stop",
          text: "42",
          content: [
            {
              type: "reasoning",
              text: "Let me think...",
              providerMetadata: { unknown: { signature: "sig_abc" } },
            },
            { type: "text", text: "42" },
          ],
          usage: mockUsage({ inputTokens: 10, outputTokens: 5 }),
          totalUsage: mockUsage({ inputTokens: 10, outputTokens: 5 }),
        }),
        "anthropic/claude-3",
      );

      expect(result.content).toHaveLength(2);
      const thinking = result.content.find((c) => c.type === "thinking");
      expect(thinking).toBeDefined();
      if (thinking?.type === "thinking") {
        expect(thinking.thinking).toBe("Let me think...");
        expect(thinking.signature).toBe("sig_abc");
      }
    });

    test("should include redacted thinking blocks", () => {
      const result = toMessages(
        mockGenerateTextResult({
          finishReason: "stop",
          text: "42",
          content: [
            {
              type: "reasoning",
              text: "",
              providerMetadata: { unknown: { redactedData: "encrypted_data" } },
            },
            { type: "text", text: "42" },
          ],
          usage: mockUsage({ inputTokens: 10, outputTokens: 5 }),
          totalUsage: mockUsage({ inputTokens: 10, outputTokens: 5 }),
        }),
        "anthropic/claude-3",
      );

      const redacted = result.content.find((c) => c.type === "redacted_thinking");
      expect(redacted).toBeDefined();
      if (redacted?.type === "redacted_thinking") {
        expect(redacted.data).toBe("encrypted_data");
      }
    });

    test("should skip empty text blocks", () => {
      const result = toMessages(
        mockGenerateTextResult({
          finishReason: "stop",
          text: "",
          content: [{ type: "text", text: "" }],
          usage: mockUsage(),
          totalUsage: mockUsage(),
        }),
        "anthropic/claude-3",
      );
      expect(result.content.filter((c) => c.type === "text")).toHaveLength(0);
    });

    test("should resolve service_tier from providerMetadata and map to Anthropic values", () => {
      const result = toMessages(
        mockGenerateTextResult({
          finishReason: "stop",
          text: "Hi",
          content: [{ type: "text", text: "Hi" }],
          usage: mockUsage(),
          totalUsage: mockUsage(),
          providerMetadata: {
            anthropic: { service_tier: "default" },
          },
        }),
        "anthropic/claude-3",
      );
      expect(result.service_tier).toBe("standard_only");
    });

    test("should map service_tier 'auto' to Anthropic 'auto'", () => {
      const result = toMessages(
        mockGenerateTextResult({
          finishReason: "stop",
          text: "Hi",
          content: [{ type: "text", text: "Hi" }],
          usage: mockUsage(),
          totalUsage: mockUsage(),
          providerMetadata: {
            anthropic: { service_tier: "auto" },
          },
        }),
        "anthropic/claude-3",
      );
      expect(result.service_tier).toBe("auto");
    });

    test("should return undefined service_tier for unmapped values", () => {
      const result = toMessages(
        mockGenerateTextResult({
          finishReason: "stop",
          text: "Hi",
          content: [{ type: "text", text: "Hi" }],
          usage: mockUsage(),
          totalUsage: mockUsage(),
          providerMetadata: {
            openai: { service_tier: "scale" },
          },
        }),
        "anthropic/claude-3",
      );
      expect(result.service_tier).toBeUndefined();
    });
  });

  describe("convertToTextCallOptions", () => {
    test("should convert basic parameters", () => {
      const result = convertToTextCallOptions({
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1000,
        temperature: 0.7,
        top_p: 0.9,
      });
      expect(result.temperature).toBe(0.7);
      expect(result.topP).toBe(0.9);
      expect(result.maxOutputTokens).toBe(1000);
    });

    test("should convert stop_sequences", () => {
      const result = convertToTextCallOptions({
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1000,
        stop_sequences: ["END", "STOP"],
      });
      expect(result.stopSequences).toEqual(["END", "STOP"]);
    });

    test("should convert tools", () => {
      const result = convertToTextCallOptions({
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1000,
        tools: [
          {
            name: "get_weather",
            description: "Get weather info",
            input_schema: { type: "object", properties: { city: { type: "string" } } },
          },
        ],
      });
      expect(result.tools).toBeDefined();
      expect(Object.keys(result.tools!)).toEqual(["get_weather"]);
    });

    test("should convert tool_choice", () => {
      expect(
        convertToTextCallOptions({
          messages: [{ role: "user", content: "Hi" }],
          max_tokens: 100,
          tool_choice: { type: "auto" },
        }).toolChoice,
      ).toBe("auto");

      expect(
        convertToTextCallOptions({
          messages: [{ role: "user", content: "Hi" }],
          max_tokens: 100,
          tool_choice: { type: "any" },
        }).toolChoice,
      ).toBe("required");

      expect(
        convertToTextCallOptions({
          messages: [{ role: "user", content: "Hi" }],
          max_tokens: 100,
          tool_choice: { type: "tool", name: "my_func" },
        }).toolChoice,
      ).toEqual({ type: "tool", toolName: "my_func" });
    });

    test("should convert thinking enabled into providerOptions.unknown.reasoning", () => {
      const result = convertToTextCallOptions({
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1000,
        thinking: { type: "enabled", budget_tokens: 4096 },
      });
      const unknown = result.providerOptions["unknown"] as Record<string, unknown>;
      expect(unknown["reasoning"]).toEqual({ enabled: true, max_tokens: 4096 });
      expect(unknown["reasoning_effort"]).toBeUndefined();
      // Should NOT have any anthropic-specific or top-level keys
      expect(result.providerOptions["anthropic"]).toBeUndefined();
      expect((result as Record<string, unknown>)["thinking"]).toBeUndefined();
    });

    test("should merge output_config.effort into reasoning when thinking enabled", () => {
      const result = convertToTextCallOptions({
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1000,
        thinking: { type: "enabled", budget_tokens: 4096 },
        output_config: { effort: "high" },
      });
      const unknown = result.providerOptions["unknown"] as Record<string, unknown>;
      expect(unknown["reasoning"]).toEqual({ enabled: true, max_tokens: 4096, effort: "high" });
      expect(unknown["reasoning_effort"]).toBe("high");
    });

    test("should map output_config.effort max to xhigh", () => {
      const result = convertToTextCallOptions({
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1000,
        thinking: { type: "adaptive" },
        output_config: { effort: "max" },
      });
      const unknown = result.providerOptions["unknown"] as Record<string, unknown>;
      expect(unknown["reasoning"]).toEqual({ enabled: true, effort: "xhigh" });
      expect(unknown["reasoning_effort"]).toBe("xhigh");
    });

    test("should convert thinking adaptive into providerOptions.unknown.reasoning", () => {
      const result = convertToTextCallOptions({
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1000,
        thinking: { type: "adaptive" },
      });
      const unknown = result.providerOptions["unknown"] as Record<string, unknown>;
      expect(unknown["reasoning"]).toEqual({ enabled: true, effort: "high" });
      expect(unknown["reasoning_effort"]).toBe("high");
      // Should NOT have any anthropic-specific or top-level keys
      expect(result.providerOptions["anthropic"]).toBeUndefined();
      expect((result as Record<string, unknown>)["thinking"]).toBeUndefined();
    });

    test("should merge output_config.effort into reasoning when thinking adaptive", () => {
      const result = convertToTextCallOptions({
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1000,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
      });
      const unknown = result.providerOptions["unknown"] as Record<string, unknown>;
      expect(unknown["reasoning"]).toEqual({ enabled: true, effort: "medium" });
      expect(unknown["reasoning_effort"]).toBe("medium");
    });

    test("should create reasoning from output_config.effort alone (no thinking)", () => {
      const result = convertToTextCallOptions({
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1000,
        output_config: { effort: "low" },
      });
      const unknown = result.providerOptions["unknown"] as Record<string, unknown>;
      expect(unknown["reasoning"]).toEqual({ enabled: true, effort: "low" });
      expect(unknown["reasoning_effort"]).toBe("low");
    });

    test("should convert thinking disabled into providerOptions.unknown.reasoning", () => {
      const result = convertToTextCallOptions({
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1000,
        thinking: { type: "disabled" },
      });
      const unknown = result.providerOptions["unknown"] as Record<string, unknown>;
      expect(unknown["reasoning"]).toEqual({ enabled: false });
      // Should NOT have any anthropic-specific or top-level keys
      expect(result.providerOptions["anthropic"]).toBeUndefined();
      expect((result as Record<string, unknown>)["thinking"]).toBeUndefined();
    });

    test("should convert thinking enabled with display into providerOptions.unknown", () => {
      const result = convertToTextCallOptions({
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1000,
        thinking: { type: "enabled", budget_tokens: 4096, display: "summarized" },
      });
      const unknown = result.providerOptions["unknown"] as Record<string, unknown>;
      expect(unknown["reasoning"]).toEqual({
        enabled: true,
        max_tokens: 4096,
        summary: "auto",
      });
      // display is mapped to reasoning.summary, not a separate key
      expect(unknown["thinking_display"]).toBeUndefined();
      // Should NOT have any anthropic-specific keys
      expect(result.providerOptions["anthropic"]).toBeUndefined();
    });

    test("should map display omitted to reasoning.summary none", () => {
      const result = convertToTextCallOptions({
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1000,
        thinking: { type: "adaptive", display: "omitted" },
      });
      const unknown = result.providerOptions["unknown"] as Record<string, unknown>;
      expect(unknown["reasoning"]).toEqual({ enabled: true, effort: "high", summary: "none" });
      expect(unknown["reasoning_effort"]).toBe("high");
    });

    test("should convert output_config with json_schema", () => {
      const result = convertToTextCallOptions({
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1000,
        output_config: {
          format: {
            type: "json_schema",
            schema: { type: "object", properties: { name: { type: "string" } } },
          },
        },
      });
      expect(result.output).toBeDefined();
    });

    test("should handle output_config without format", () => {
      const result = convertToTextCallOptions({
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1000,
        output_config: {
          effort: "high",
        },
      });
      expect(result.output).toBeUndefined();
    });

    test("should apply cache_control to providerOptions", () => {
      const result = convertToTextCallOptions({
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1000,
        cache_control: { type: "ephemeral" },
      });
      expect(result.providerOptions["unknown"]).toBeDefined();
    });

    test("should pass metadata in providerOptions", () => {
      const result = convertToTextCallOptions({
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1000,
        metadata: { user_id: "u-123" },
      });
      expect((result.providerOptions["unknown"] as Record<string, unknown>)["metadata"]).toEqual({
        user_id: "u-123",
      });
    });

    test("should map service_tier 'auto' to internal 'auto'", () => {
      const result = convertToTextCallOptions({
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1000,
        service_tier: "auto",
      });
      expect((result.providerOptions["unknown"] as Record<string, unknown>)["service_tier"]).toBe(
        "auto",
      );
    });

    test("should map service_tier 'standard_only' to internal 'default'", () => {
      const result = convertToTextCallOptions({
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1000,
        service_tier: "standard_only",
      });
      expect((result.providerOptions["unknown"] as Record<string, unknown>)["service_tier"]).toBe(
        "default",
      );
    });
  });

  describe("MessagesTransformStream", () => {
    test("should stream text events correctly", async () => {
      const stream = new ReadableStream<TextStreamPart<ToolSet>>({
        start(controller) {
          controller.enqueue({ type: "text-start", id: "1" });
          controller.enqueue({ type: "text-delta", id: "1", text: "Hello" });
          controller.enqueue({ type: "text-delta", id: "1", text: " world" });
          controller.enqueue({ type: "text-end", id: "1" });
          controller.enqueue({
            type: "finish",
            finishReason: "stop",
            rawFinishReason: "stop",
            totalUsage: mockUsage({ inputTokens: 5, outputTokens: 3 }),
          });
          controller.close();
        },
      });

      const transformed = stream.pipeThrough(new MessagesTransformStream("test-model"));
      const { events } = await collectStreamEvents(transformed);

      // message_start
      expect(events[0]!.event).toBe("message_start");

      // content_block_start for text
      const blockStart = events.find(
        (e) =>
          e.event === "content_block_start" &&
          e.data.type === "content_block_start" &&
          "content_block" in e.data &&
          e.data.content_block.type === "text",
      );
      expect(blockStart).toBeDefined();

      // text deltas
      const textDeltas = events.filter(
        (e) =>
          e.event === "content_block_delta" &&
          e.data.type === "content_block_delta" &&
          "delta" in e.data &&
          e.data.delta.type === "text_delta",
      );
      expect(textDeltas).toHaveLength(2);

      // message_delta with stop reason and usage (including input_tokens)
      const messageDelta = events.find((e) => e.event === "message_delta");
      expect(messageDelta).toBeDefined();
      if (messageDelta?.event === "message_delta") {
        expect(messageDelta.data.delta.stop_reason).toBe("end_turn");
        expect(messageDelta.data.usage.output_tokens).toBe(3);
        expect(messageDelta.data.usage.input_tokens).toBe(5);
      }

      // message_stop
      const messageStop = events.find((e) => e.event === "message_stop");
      expect(messageStop).toBeDefined();
    });

    test("should stream tool call events correctly", async () => {
      const stream = new ReadableStream<TextStreamPart<ToolSet>>({
        start(controller) {
          controller.enqueue({
            type: "tool-input-start",
            id: "call_1",
            toolName: "get_weather",
          });
          controller.enqueue({
            type: "tool-input-delta",
            id: "call_1",
            delta: '{"city":',
          });
          controller.enqueue({
            type: "tool-input-delta",
            id: "call_1",
            delta: '"SF"}',
          });
          controller.enqueue({
            type: "tool-call",
            toolCallId: "call_1",
            toolName: "get_weather",
            input: { city: "SF" },
          });
          controller.enqueue({
            type: "finish",
            finishReason: "tool-calls",
            rawFinishReason: "tool_calls",
            totalUsage: mockUsage({ outputTokens: 10 }),
          });
          controller.close();
        },
      });

      const transformed = stream.pipeThrough(new MessagesTransformStream("test-model"));
      const { events } = await collectStreamEvents(transformed);

      // tool_use content_block_start
      const toolStart = events.find(
        (e) =>
          e.event === "content_block_start" &&
          "content_block" in e.data &&
          e.data.content_block.type === "tool_use",
      );
      expect(toolStart).toBeDefined();
      if (
        toolStart?.event === "content_block_start" &&
        toolStart.data.content_block.type === "tool_use"
      ) {
        expect(toolStart.data.content_block.id).toBe("call_1");
        expect(toolStart.data.content_block.name).toBe("get_weather");
      }

      // input_json_delta events
      const inputDeltas = events.filter(
        (e) =>
          e.event === "content_block_delta" &&
          "delta" in e.data &&
          e.data.delta.type === "input_json_delta",
      );
      expect(inputDeltas).toHaveLength(2);

      // content_block_stop for the tool
      const toolStop = events.filter((e) => e.event === "content_block_stop");
      expect(toolStop.length).toBeGreaterThanOrEqual(1);

      // finish with tool_use stop reason
      const messageDelta = events.find((e) => e.event === "message_delta");
      if (messageDelta?.event === "message_delta") {
        expect(messageDelta.data.delta.stop_reason).toBe("tool_use");
      }
    });

    test("should stream non-streaming tool call events", async () => {
      const stream = new ReadableStream<TextStreamPart<ToolSet>>({
        start(controller) {
          controller.enqueue({
            type: "tool-call",
            toolCallId: "call_2",
            toolName: "search",
            input: { query: "test" },
          });
          controller.enqueue({
            type: "finish",
            finishReason: "tool-calls",
            rawFinishReason: "tool_calls",
            totalUsage: mockUsage({ outputTokens: 5 }),
          });
          controller.close();
        },
      });

      const transformed = stream.pipeThrough(new MessagesTransformStream("test-model"));
      const { events } = await collectStreamEvents(transformed);

      // Should have content_block_start, input_json_delta, content_block_stop
      const toolStart = events.find(
        (e) =>
          e.event === "content_block_start" &&
          "content_block" in e.data &&
          e.data.content_block.type === "tool_use",
      );
      expect(toolStart).toBeDefined();

      const inputDelta = events.find(
        (e) =>
          e.event === "content_block_delta" &&
          "delta" in e.data &&
          e.data.delta.type === "input_json_delta",
      );
      expect(inputDelta).toBeDefined();
    });

    test("should stream reasoning events correctly", async () => {
      const stream = new ReadableStream<TextStreamPart<ToolSet>>({
        start(controller) {
          controller.enqueue({ type: "reasoning-start", id: "r1" });
          controller.enqueue({ type: "reasoning-delta", id: "r1", text: "Thinking..." });
          controller.enqueue({
            type: "reasoning-delta",
            id: "r1",
            text: "",
            providerMetadata: { anthropic: { signature: "sig_xyz" } },
          });
          controller.enqueue({ type: "reasoning-end", id: "r1" });
          controller.enqueue({ type: "text-start", id: "t1" });
          controller.enqueue({ type: "text-delta", id: "t1", text: "Answer" });
          controller.enqueue({ type: "text-end", id: "t1" });
          controller.enqueue({
            type: "finish",
            finishReason: "stop",
            rawFinishReason: "stop",
            totalUsage: mockUsage({ outputTokens: 8 }),
          });
          controller.close();
        },
      });

      const transformed = stream.pipeThrough(new MessagesTransformStream("test-model"));
      const { events } = await collectStreamEvents(transformed);

      // thinking content_block_start
      const thinkingStart = events.find(
        (e) =>
          e.event === "content_block_start" &&
          "content_block" in e.data &&
          e.data.content_block.type === "thinking",
      );
      expect(thinkingStart).toBeDefined();

      // thinking_delta
      const thinkingDeltas = events.filter(
        (e) =>
          e.event === "content_block_delta" &&
          "delta" in e.data &&
          e.data.delta.type === "thinking_delta",
      );
      expect(thinkingDeltas).toHaveLength(1);

      // signature_delta
      const signatureDeltas = events.filter(
        (e) =>
          e.event === "content_block_delta" &&
          "delta" in e.data &&
          e.data.delta.type === "signature_delta",
      );
      expect(signatureDeltas).toHaveLength(1);
      if (signatureDeltas[0]?.event === "content_block_delta") {
        const delta = signatureDeltas[0].data.delta;
        if (delta.type === "signature_delta") {
          expect(delta.signature).toBe("sig_xyz");
        }
      }

      // text block follows
      const textStart = events.find(
        (e) =>
          e.event === "content_block_start" &&
          "content_block" in e.data &&
          e.data.content_block.type === "text",
      );
      expect(textStart).toBeDefined();

      // Block indices should increment
      const blockStops = events.filter((e) => e.event === "content_block_stop");
      expect(blockStops).toHaveLength(2);
    });

    test("should handle error events", async () => {
      const stream = new ReadableStream<TextStreamPart<ToolSet>>({
        start(controller) {
          controller.enqueue({
            type: "error",
            error: new Error("Something went wrong"),
          });
          controller.close();
        },
      });

      const transformed = stream.pipeThrough(new MessagesTransformStream("test-model"));
      const { events } = await collectStreamEvents(transformed);

      // Should have message_start + named error event
      const errorEvent = events.find((e) => e.event === "error");
      expect(errorEvent).toBeDefined();
      expect(
        (errorEvent as { data: { type: string; error: { type: string; message: string } } }).data
          .error.message,
      ).toBe("Something went wrong");
    });
  });
});
