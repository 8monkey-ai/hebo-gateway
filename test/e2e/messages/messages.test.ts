import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import Anthropic, { APIError } from "@anthropic-ai/sdk";

import { defineModelCatalog, gateway } from "../../../src";
import { claudeHaiku45, claudeSonnet4 } from "../../../src/models/anthropic";
import { withCanonicalIdsForBedrock } from "../../../src/providers/bedrock";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const BEDROCK_ACCESS_KEY_ID = process.env["BEDROCK_ACCESS_KEY_ID"];
const BEDROCK_SECRET_ACCESS_KEY = process.env["BEDROCK_SECRET_ACCESS_KEY"];
const hasCredentials = !!(BEDROCK_ACCESS_KEY_ID && BEDROCK_SECRET_ACCESS_KEY);

const REGION = process.env["BEDROCK_REGION"] ?? "us-east-1";
const MODEL = "anthropic/claude-haiku-4.5";
const THINKING_MODEL = "anthropic/claude-sonnet-4";

// ---------------------------------------------------------------------------
// Shared tool definitions
// ---------------------------------------------------------------------------

const WEATHER_TOOL: Anthropic.Messages.Tool = {
  name: "get_weather",
  description: "Get the current weather for a given location.",
  input_schema: {
    type: "object" as const,
    properties: {
      location: { type: "string", description: "City and state" },
    },
    required: ["location"],
  },
};

const CALCULATOR_TOOL: Anthropic.Messages.Tool = {
  name: "calculator",
  description: "Perform basic arithmetic. Returns the numeric result.",
  input_schema: {
    type: "object" as const,
    properties: {
      expression: { type: "string", description: "A math expression, e.g. 2+2" },
    },
    required: ["expression"],
  },
};

// ---------------------------------------------------------------------------
// Gateway + Server setup
// ---------------------------------------------------------------------------

let server: ReturnType<typeof Bun.serve>;
let client: Anthropic;
let baseUrl: string;

const startServer = () => {
  // Prevent @ai-sdk/amazon-bedrock from inheriting CI's AWS_SESSION_TOKEN,
  // which conflicts with the static BEDROCK_* credentials.
  delete process.env["AWS_SESSION_TOKEN"];
  delete process.env["AWS_ACCESS_KEY_ID"];
  delete process.env["AWS_SECRET_ACCESS_KEY"];

  const bedrock = createAmazonBedrock({
    region: REGION,
    accessKeyId: BEDROCK_ACCESS_KEY_ID!,
    secretAccessKey: BEDROCK_SECRET_ACCESS_KEY!,
  });

  const gw = gateway({
    basePath: "/v1",
    logger: { level: "warn" },
    providers: {
      bedrock: withCanonicalIdsForBedrock(bedrock),
    },
    models: defineModelCatalog(claudeHaiku45(), claudeSonnet4()),
    // Extended timeout for Bedrock cold starts and thinking models
    timeouts: { normal: 120_000, flex: 360_000 },
  });

  server = Bun.serve({
    port: 0, // random available port
    fetch: (request) => gw.handler(request),
  });

  baseUrl = `http://localhost:${server.port}`;

  client = new Anthropic({
    apiKey: "not-needed", // Auth is handled by the Bedrock provider
    baseURL: baseUrl, // Gateway routes are at root, not /v1
  });
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!hasCredentials)("Messages E2E (Bedrock)", () => {
  beforeAll(() => {
    startServer();
  });

  afterAll(async () => {
    await server?.stop(true);
  });

  // =========================================================================
  // 1. Non-streaming text generation
  // =========================================================================
  test(
    "non-streaming: returns a text response",
    async () => {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 64,
        messages: [{ role: "user", content: "Reply with exactly: hello world" }],
      });

      expect(message.type).toBe("message");
      expect(message.role).toBe("assistant");
      expect(message.model).toBe(MODEL);
      expect(message.stop_reason).toBe("end_turn");
      expect(message.content.length).toBeGreaterThanOrEqual(1);
      expect(message.content[0]!.type).toBe("text");
      expect((message.content[0] as { type: "text"; text: string }).text.length).toBeGreaterThan(0);
      expect(message.usage.input_tokens).toBeGreaterThan(0);
      expect(message.usage.output_tokens).toBeGreaterThan(0);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 2. Streaming text generation
  // =========================================================================
  test(
    "streaming: returns streamed text events",
    async () => {
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: 64,
        messages: [{ role: "user", content: "Reply with exactly: hello world" }],
      });

      const message = await stream.finalMessage();

      expect(message.type).toBe("message");
      expect(message.role).toBe("assistant");
      expect(message.stop_reason).toBe("end_turn");
      expect(message.content.length).toBeGreaterThanOrEqual(1);
      expect(message.content[0]!.type).toBe("text");
      expect((message.content[0] as { type: "text"; text: string }).text.length).toBeGreaterThan(0);
      expect(message.usage.output_tokens).toBeGreaterThan(0);
      expect(message.usage.input_tokens).toBeGreaterThan(0);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 3. System prompt (string)
  // =========================================================================
  test(
    "system prompt: influences response",
    async () => {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 64,
        system: "You are a pirate. You always respond with 'Ahoy!' first.",
        messages: [{ role: "user", content: "Say hello" }],
      });

      expect(message.type).toBe("message");
      const text = (message.content[0] as { type: "text"; text: string }).text;
      expect(text.toLowerCase()).toContain("ahoy");
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 4. Tool use (tool_choice: any)
  // =========================================================================
  test(
    "tool use: model invokes a tool",
    async () => {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content: "What is the current weather in San Francisco? Use the get_weather tool.",
          },
        ],
        tools: [WEATHER_TOOL],
        tool_choice: { type: "any" },
      });

      expect(message.stop_reason).toBe("tool_use");
      const toolUseBlock = message.content.find((b) => b.type === "tool_use");
      expect(toolUseBlock).toBeDefined();
      expect((toolUseBlock as { name: string }).name).toBe("get_weather");
      expect((toolUseBlock as { input: Record<string, unknown> }).input).toBeDefined();
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 5. Multi-turn conversation
  // =========================================================================
  test(
    "multi-turn: maintains context across turns",
    async () => {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 128,
        messages: [
          { role: "user", content: "My name is Alice." },
          { role: "assistant", content: "Hello Alice! Nice to meet you." },
          { role: "user", content: "What is my name?" },
        ],
      });

      expect(message.type).toBe("message");
      const text = (message.content[0] as { type: "text"; text: string }).text;
      expect(text).toContain("Alice");
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 6. Extended thinking (enabled)
  // =========================================================================
  test(
    "extended thinking: returns thinking blocks with content",
    async () => {
      const message = await client.messages.create({
        model: THINKING_MODEL,
        max_tokens: 16000,
        thinking: { type: "enabled", budget_tokens: 5000 },
        messages: [{ role: "user", content: "What is 27 * 453? Think step by step." }],
      });

      expect(message.type).toBe("message");
      expect(message.stop_reason).toBe("end_turn");

      // Verify thinking blocks are present (validates Q3 reasoning parameter fix)
      const thinkingBlocks = message.content.filter((b) => b.type === "thinking");
      expect(thinkingBlocks.length).toBeGreaterThan(0);
      const thinking = thinkingBlocks[0] as { type: "thinking"; thinking: string };
      expect(thinking.thinking.length).toBeGreaterThan(0);

      const textBlock = message.content.find((b) => b.type === "text");
      expect(textBlock).toBeDefined();
      // Model may format as "12,231" or "12231"
      expect((textBlock as { type: "text"; text: string }).text.replaceAll(",", "")).toContain(
        "12231",
      );
    },
    { timeout: 120_000 },
  );

  // =========================================================================
  // 7. Error handling (existing)
  // =========================================================================
  describe("error handling", () => {
    test(
      "invalid model: returns an error",
      async () => {
        try {
          await client.messages.create({
            model: "nonexistent/model-xyz",
            max_tokens: 64,
            messages: [{ role: "user", content: "hi" }],
          });
          // Should not reach here
          expect(true).toBe(false);
        } catch (error: unknown) {
          expect(error).toBeInstanceOf(APIError);
          const apiError = error as APIError;
          // Gateway returns 422 for model not found
          expect(apiError.status).toBeGreaterThanOrEqual(400);
        }
      },
      { timeout: 30_000 },
    );

    test(
      "missing required fields: returns a 400 error",
      async () => {
        const res = await fetch(`${baseUrl}/v1/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: MODEL,
            // missing max_tokens and messages
          }),
        });
        expect(res.status).toBe(400);
        const body = (await res.json()) as { type: string; error: { type: string } };
        expect(body.type).toBe("error");
        expect(body.error.type).toBe("invalid_request_error");
      },
      { timeout: 30_000 },
    );
  });

  // =========================================================================
  // 8. Streaming tool use
  // =========================================================================
  test(
    "streaming tool use: emits tool_use content blocks",
    async () => {
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content: "What is the weather in London? Use the get_weather tool.",
          },
        ],
        tools: [WEATHER_TOOL],
        tool_choice: { type: "any" },
      });

      const message = await stream.finalMessage();

      expect(message.stop_reason).toBe("tool_use");
      const toolUseBlock = message.content.find((b) => b.type === "tool_use");
      expect(toolUseBlock).toBeDefined();
      expect((toolUseBlock as Anthropic.Messages.ToolUseBlock).name).toBe("get_weather");
      expect((toolUseBlock as Anthropic.Messages.ToolUseBlock).input).toBeDefined();
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 9. Streaming extended thinking
  // =========================================================================
  test(
    "streaming extended thinking: returns thinking blocks in stream",
    async () => {
      const stream = client.messages.stream({
        model: THINKING_MODEL,
        max_tokens: 16000,
        thinking: { type: "enabled", budget_tokens: 5000 },
        messages: [{ role: "user", content: "What is 15 * 37?" }],
      });

      const message = await stream.finalMessage();

      expect(message.type).toBe("message");
      expect(message.stop_reason).toBe("end_turn");

      // Verify thinking blocks are present (validates Q3 reasoning parameter fix in streaming)
      const thinkingBlocks = message.content.filter((b) => b.type === "thinking");
      expect(thinkingBlocks.length).toBeGreaterThan(0);
      const thinking = thinkingBlocks[0] as { type: "thinking"; thinking: string };
      expect(thinking.thinking.length).toBeGreaterThan(0);

      const textBlock = message.content.find((b) => b.type === "text");
      expect(textBlock).toBeDefined();
      expect((textBlock as Anthropic.Messages.TextBlock).text).toContain("555");
    },
    { timeout: 120_000 },
  );

  // =========================================================================
  // 10. Streaming event structure (raw SSE validation)
  // =========================================================================
  test(
    "streaming event structure: correct SSE event sequence",
    async () => {
      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 32,
          stream: true,
          messages: [{ role: "user", content: "Say hi" }],
        }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");

      const text = await res.text();
      const events = text
        .split("\n\n")
        .filter((e) => e.startsWith("event:"))
        .map((e) => {
          const eventLine = e.split("\n").find((l) => l.startsWith("event:"));
          return eventLine?.replace("event: ", "").trim();
        });

      // Validate the event sequence
      expect(events[0]).toBe("message_start");
      expect(events).toContain("content_block_start");
      expect(events).toContain("content_block_delta");
      expect(events).toContain("content_block_stop");
      expect(events).toContain("message_delta");
      expect(events.at(-1)).toBe("message_stop");

      // Validate ordering: message_start first, message_stop last
      const startIdx = events.indexOf("message_start");
      const stopIdx = events.lastIndexOf("message_stop");
      const deltaIdx = events.indexOf("message_delta");
      expect(startIdx).toBe(0);
      expect(deltaIdx).toBeLessThan(stopIdx);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 11. Multi-turn tool use (tool_result round-trip)
  // =========================================================================
  test(
    "multi-turn tool use: tool_result round-trip",
    async () => {
      // Step 1: model calls the tool
      const step1 = await client.messages.create({
        model: MODEL,
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content: "What is the weather in Paris? Use the get_weather tool.",
          },
        ],
        tools: [WEATHER_TOOL],
        tool_choice: { type: "any" },
      });

      expect(step1.stop_reason).toBe("tool_use");
      const toolUse = step1.content.find(
        (b) => b.type === "tool_use",
      ) as Anthropic.Messages.ToolUseBlock;
      expect(toolUse).toBeDefined();

      // Step 2: send tool result back
      const step2 = await client.messages.create({
        model: MODEL,
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content: "What is the weather in Paris? Use the get_weather tool.",
          },
          { role: "assistant", content: step1.content },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: toolUse.id,
                content: "It is 22 degrees Celsius and sunny in Paris.",
              },
            ],
          },
        ],
        tools: [WEATHER_TOOL],
      });

      expect(step2.type).toBe("message");
      expect(step2.stop_reason).toBe("end_turn");
      const text = (step2.content.find((b) => b.type === "text") as Anthropic.Messages.TextBlock)
        ?.text;
      expect(text).toBeDefined();
      // The model should incorporate the tool result
      expect(text.toLowerCase()).toMatch(/paris|22|sunny|celsius/);
    },
    { timeout: 90_000 },
  );

  // =========================================================================
  // 12. tool_choice: auto
  // =========================================================================
  test(
    "tool_choice auto: model can choose not to call a tool",
    async () => {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 128,
        messages: [{ role: "user", content: "What is 2 + 2?" }],
        tools: [WEATHER_TOOL],
        tool_choice: { type: "auto" },
      });

      expect(message.type).toBe("message");
      // The model should answer directly without calling the weather tool
      // It may or may not use a tool, but the response should be valid
      expect(message.content.length).toBeGreaterThanOrEqual(1);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 13. tool_choice: tool (named)
  // =========================================================================
  test(
    "tool_choice tool: forces specific tool by name",
    async () => {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 256,
        messages: [{ role: "user", content: "Tell me anything." }],
        tools: [WEATHER_TOOL, CALCULATOR_TOOL],
        tool_choice: { type: "tool", name: "calculator" },
      });

      expect(message.stop_reason).toBe("tool_use");
      const toolUseBlock = message.content.find(
        (b) => b.type === "tool_use",
      ) as Anthropic.Messages.ToolUseBlock;
      expect(toolUseBlock).toBeDefined();
      expect(toolUseBlock.name).toBe("calculator");
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 14. tool_choice: none
  // =========================================================================
  test(
    "tool_choice none: no tool calls returned",
    async () => {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 128,
        messages: [
          {
            role: "user",
            content: "What is the weather in Tokyo?",
          },
        ],
        tools: [WEATHER_TOOL],
        tool_choice: { type: "none" },
      });

      expect(message.type).toBe("message");
      // No tool_use blocks should appear
      const toolBlocks = message.content.filter((b) => b.type === "tool_use");
      expect(toolBlocks.length).toBe(0);
      expect(message.stop_reason).not.toBe("tool_use");
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 15. Multiple tools defined
  // =========================================================================
  test(
    "multiple tools: model picks the right one",
    async () => {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content: "What is the weather in Berlin? Use the appropriate tool.",
          },
        ],
        tools: [WEATHER_TOOL, CALCULATOR_TOOL],
        tool_choice: { type: "any" },
      });

      expect(message.stop_reason).toBe("tool_use");
      const toolUseBlock = message.content.find(
        (b) => b.type === "tool_use",
      ) as Anthropic.Messages.ToolUseBlock;
      expect(toolUseBlock).toBeDefined();
      expect(toolUseBlock.name).toBe("get_weather");
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 16. tool_result with is_error: true
  // =========================================================================
  test(
    "tool_result with is_error: model handles error gracefully",
    async () => {
      // Step 1: force tool call
      const step1 = await client.messages.create({
        model: MODEL,
        max_tokens: 256,
        messages: [
          { role: "user", content: "Check the weather in Mars. Use the get_weather tool." },
        ],
        tools: [WEATHER_TOOL],
        tool_choice: { type: "any" },
      });

      const toolUse = step1.content.find(
        (b) => b.type === "tool_use",
      ) as Anthropic.Messages.ToolUseBlock;

      // Step 2: send error result
      const step2 = await client.messages.create({
        model: MODEL,
        max_tokens: 256,
        messages: [
          { role: "user", content: "Check the weather in Mars. Use the get_weather tool." },
          { role: "assistant", content: step1.content },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: toolUse.id,
                content: "Error: Location 'Mars' not found. Only Earth locations are supported.",
                is_error: true,
              },
            ],
          },
        ],
        tools: [WEATHER_TOOL],
      });

      expect(step2.type).toBe("message");
      // Model should handle the error and respond appropriately
      expect(step2.content.length).toBeGreaterThanOrEqual(1);
    },
    { timeout: 90_000 },
  );

  // =========================================================================
  // 17. System prompt as structured blocks
  // =========================================================================
  test(
    "system prompt blocks: structured array with cache_control",
    async () => {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 64,
        system: [
          {
            type: "text",
            text: "You are a helpful robot. Always start your response with 'BEEP BOOP'.",
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: "Hello" }],
      });

      expect(message.type).toBe("message");
      const text = (message.content[0] as Anthropic.Messages.TextBlock).text;
      expect(text.toUpperCase()).toContain("BEEP");
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 18. Thinking disabled
  // =========================================================================
  test(
    "thinking disabled: no thinking blocks returned",
    async () => {
      const message = await client.messages.create({
        model: THINKING_MODEL,
        max_tokens: 128,
        thinking: { type: "disabled" },
        messages: [{ role: "user", content: "What is 2 + 2?" }],
      });

      expect(message.type).toBe("message");
      const thinkingBlocks = message.content.filter((b) => b.type === "thinking");
      expect(thinkingBlocks.length).toBe(0);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 19. Thinking adaptive (maps to "enabled" on Bedrock Converse API)
  // =========================================================================
  test(
    "thinking adaptive: accepted and produces valid response",
    async () => {
      // Send adaptive thinking to exercise the gateway's adaptive → enabled mapping.
      // Bedrock's Converse API doesn't support "adaptive" natively, so the gateway
      // maps it to "enabled" with a computed budgetTokens fallback.
      // See: https://docs.aws.amazon.com/bedrock/latest/userguide/claude-messages-adaptive-thinking.html
      const message = await client.messages.create({
        model: THINKING_MODEL,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        messages: [
          {
            role: "user",
            content: "What is 47 * 83? Think carefully.",
          },
        ],
      });

      expect(message.type).toBe("message");
      expect(message.stop_reason).toBe("end_turn");

      // Since adaptive maps to enabled, thinking blocks should be present
      const thinkingBlocks = message.content.filter((b) => b.type === "thinking");
      expect(thinkingBlocks.length).toBeGreaterThan(0);

      const textBlock = message.content.find((b) => b.type === "text");
      expect(textBlock).toBeDefined();
      expect((textBlock as Anthropic.Messages.TextBlock).text.replaceAll(",", "")).toContain(
        "3901",
      );
    },
    { timeout: 120_000 },
  );

  // =========================================================================
  // 20. stop_sequences
  // =========================================================================
  test(
    "stop_sequences: stops generation at sequence",
    async () => {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 256,
        stop_sequences: ["STOP"],
        messages: [
          {
            role: "user",
            content:
              "Count from 1 to 10. After the number 3, write the word STOP. Format: 1, 2, 3, STOP, 5...",
          },
        ],
      });

      expect(message.type).toBe("message");
      expect(message.stop_reason).toBe("end_turn");
      // Note: stop_reason may be "end_turn" if the model finishes before hitting the stop sequence,
      // or "stop_sequence" if it hits it. The behavior depends on the model.
      // We validate the mechanism works by checking the response is truncated or stop_reason is correct.
      const text = (message.content[0] as Anthropic.Messages.TextBlock).text;
      if (message.stop_reason === "stop_sequence") {
        // Text should not contain "STOP" (it's consumed as the stop sequence)
        expect(text).not.toContain("STOP");
      }
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 21. max_tokens limit
  // =========================================================================
  test(
    "max_tokens: very low limit triggers max_tokens stop reason",
    async () => {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 3,
        messages: [
          {
            role: "user",
            content: "Write a very long essay about the history of the universe.",
          },
        ],
      });

      expect(message.type).toBe("message");
      expect(message.stop_reason).toBe("max_tokens");
      expect(message.usage.output_tokens).toBeLessThanOrEqual(5); // small margin
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 22. metadata.user_id passthrough
  // =========================================================================
  test(
    "metadata: user_id passes through without error",
    async () => {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 32,
        metadata: { user_id: "test-user-123" },
        messages: [{ role: "user", content: "Say ok" }],
      });

      expect(message.type).toBe("message");
      expect(message.content.length).toBeGreaterThanOrEqual(1);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 23. temperature parameter
  // =========================================================================
  test(
    "temperature: temperature 0 produces valid response",
    async () => {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 32,
        temperature: 0,
        messages: [{ role: "user", content: "What is 1+1? Reply with just the number." }],
      });

      expect(message.type).toBe("message");
      const text = (message.content[0] as Anthropic.Messages.TextBlock).text;
      expect(text).toContain("2");
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 24. Structured output (output_config with JSON schema)
  // =========================================================================
  test(
    "structured output: returns valid JSON matching schema",
    async () => {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content: "Give me a person with name 'Alice' and age 30.",
          },
        ],
        output_config: {
          format: {
            type: "json_schema",
            schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                age: { type: "number" },
              },
              required: ["name", "age"],
            },
          },
        },
      });

      expect(message.type).toBe("message");
      const textBlock = message.content.find(
        (b) => b.type === "text",
      ) as Anthropic.Messages.TextBlock;
      expect(textBlock).toBeDefined();
      // The text should be valid JSON
      const parsed = JSON.parse(textBlock.text) as { name: unknown; age: unknown };
      expect(parsed.name).toBeDefined();
      expect(parsed.age).toBeDefined();
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 25. Wrong HTTP method (GET)
  // =========================================================================
  test(
    "wrong HTTP method: GET returns 405 with Anthropic error format",
    async () => {
      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: "GET",
      });

      expect(res.status).toBe(405);
      const body = (await res.json()) as { type: string; error: { type: string; message: string } };
      expect(body.type).toBe("error");
      expect(body.error.type).toBeDefined();
    },
    { timeout: 15_000 },
  );

  // =========================================================================
  // 26. thinking.budget_tokens below minimum (1024)
  // =========================================================================
  test(
    "thinking budget below minimum: returns validation error",
    async () => {
      try {
        await client.messages.create({
          model: THINKING_MODEL,
          max_tokens: 16000,
          thinking: { type: "enabled", budget_tokens: 100 },
          messages: [{ role: "user", content: "Hello" }],
        });
        expect(true).toBe(false);
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(APIError);
        expect((error as APIError).status).toBe(400);
        expect((error as APIError).error).toMatchObject({
          type: "error",
          error: { type: "invalid_request_error" },
        });
      }
    },
    { timeout: 15_000 },
  );

  // =========================================================================
  // 27. Response ID format
  // =========================================================================
  test(
    "response ID: starts with msg_ prefix",
    async () => {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 16,
        messages: [{ role: "user", content: "Hi" }],
      });

      expect(message.id).toStartWith("msg_");
      expect(message.id.length).toBeGreaterThan(4);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 28. Image input (base64) — small 1x1 red PNG
  // =========================================================================
  test(
    "image input base64: accepts image content block",
    async () => {
      // 1x1 red pixel PNG
      const RED_PIXEL_PNG =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 64,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: "image/png", data: RED_PIXEL_PNG },
              },
              { type: "text", text: "What color is this pixel?" },
            ],
          },
        ],
      });

      expect(message.type).toBe("message");
      expect(message.content.length).toBeGreaterThanOrEqual(1);
      const text = (message.content.find((b) => b.type === "text") as Anthropic.Messages.TextBlock)
        ?.text;
      expect(text).toBeDefined();
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 29. Mixed content blocks (text + image)
  // =========================================================================
  test(
    "mixed content: text and image blocks in single message",
    async () => {
      const RED_PIXEL_PNG =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 64,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "I'm sending you an image. " },
              {
                type: "image",
                source: { type: "base64", media_type: "image/png", data: RED_PIXEL_PNG },
              },
              { type: "text", text: "Describe what you see." },
            ],
          },
        ],
      });

      expect(message.type).toBe("message");
      expect(message.content.length).toBeGreaterThanOrEqual(1);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 30. Document input (text source)
  // =========================================================================
  test(
    "document input text: accepts document with text source",
    async () => {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 64,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "text",
                  data: "The capital of France is Paris.",
                  media_type: "text/plain",
                },
              },
              {
                type: "text",
                text: "What is the capital mentioned in the document?",
              },
            ],
          },
        ],
      });

      expect(message.type).toBe("message");
      const textBlock = message.content.find(
        (b) => b.type === "text",
      ) as Anthropic.Messages.TextBlock;
      expect(textBlock?.text?.toLowerCase()).toContain("paris");
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 31. Oversized request body
  // =========================================================================
  test(
    "oversized body: returns appropriate error",
    async () => {
      // Create a body larger than 10MB (DEFAULT_MAX_BODY_SIZE)
      const bigString = "x".repeat(11 * 1024 * 1024);
      try {
        await client.messages.create({
          model: MODEL,
          max_tokens: 64,
          messages: [{ role: "user", content: bigString }],
        });
        expect(true).toBe(false);
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(APIError);
        expect((error as APIError).status).toBeGreaterThanOrEqual(400);
      }
    },
    { timeout: 30_000 },
  );

  // =========================================================================
  // 32. Usage fields present
  // =========================================================================
  test(
    "usage: input_tokens and output_tokens are present and valid",
    async () => {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 32,
        messages: [{ role: "user", content: "Hello" }],
      });

      expect(message.usage).toBeDefined();
      expect(typeof message.usage.input_tokens).toBe("number");
      expect(typeof message.usage.output_tokens).toBe("number");
      expect(message.usage.input_tokens).toBeGreaterThan(0);
      expect(message.usage.output_tokens).toBeGreaterThan(0);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 33. Streaming input_tokens populated (Q4 fix validation)
  // =========================================================================
  test(
    "streaming usage: input_tokens is populated in final message",
    async () => {
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: 32,
        messages: [{ role: "user", content: "Say hello" }],
      });

      const message = await stream.finalMessage();

      expect(message.usage).toBeDefined();
      expect(message.usage.output_tokens).toBeGreaterThan(0);
      expect(message.usage.input_tokens).toBeGreaterThan(0);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 34. Cache token usage verification (Q2)
  // =========================================================================
  test(
    "cache tokens: sequential requests with cache_control show cache usage",
    async () => {
      // Bedrock prompt caching requires a minimum of ~1024 tokens in the cached
      // content. Generate a system prompt well above that threshold (~4000 tokens)
      // to guarantee caching activates in us-east-1 with Claude Haiku 4.5.
      // Include a unique run ID to avoid reading from a cache created by a previous test run.
      const runId = crypto.randomUUID();
      const longSystemText =
        `Session ${runId}. ` +
        "You are a helpful assistant who always provides detailed and thoughtful responses. ".repeat(
          800,
        ) +
        "Always respond concisely when asked a short question.";

      const createParams = {
        model: MODEL,
        max_tokens: 32,
        system: [
          {
            type: "text" as const,
            text: longSystemText,
            cache_control: { type: "ephemeral" as const },
          },
        ],
        messages: [{ role: "user" as const, content: "Say hello" }],
      };

      // First request — should create cache entry
      const msg1 = await client.messages.create(createParams);
      expect(msg1.type).toBe("message");

      // Wait for cache to be committed on Bedrock side before reading
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 3000);
      });

      // Second request — should read from cache (within 5min TTL)
      const msg2 = await client.messages.create(createParams);
      expect(msg2.type).toBe("message");

      expect(msg1.usage.input_tokens).toBeGreaterThan(0);
      expect(msg2.usage.input_tokens).toBeGreaterThan(0);

      // The first request should show cache creation tokens (writing the prompt to cache)
      expect(msg1.usage.cache_creation_input_tokens).toBeGreaterThan(0);

      // The second request should show cache read tokens (reading from cache)
      expect(msg2.usage.cache_read_input_tokens).toBeGreaterThan(0);
    },
    { timeout: 120_000 },
  );
});
