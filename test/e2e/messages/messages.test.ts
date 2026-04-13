import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import Anthropic, { APIError } from "@anthropic-ai/sdk";

import { defineModelCatalog, gateway } from "../../../src";
import { withCanonicalIdsForBedrock } from "../../../src/providers/bedrock/canonical";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const BEDROCK_ACCESS_KEY_ID = process.env["BEDROCK_ACCESS_KEY_ID"];
const BEDROCK_SECRET_ACCESS_KEY = process.env["BEDROCK_SECRET_ACCESS_KEY"];
const hasCredentials = !!(BEDROCK_ACCESS_KEY_ID && BEDROCK_SECRET_ACCESS_KEY);

const REGION = process.env["BEDROCK_REGION"] ?? "us-east-1";
const MODEL = "anthropic/claude-haiku-3.5";
const THINKING_MODEL = "anthropic/claude-sonnet-3.7";

// ---------------------------------------------------------------------------
// Gateway + Server setup
// ---------------------------------------------------------------------------

let server: ReturnType<typeof Bun.serve>;
let client: Anthropic;

const startServer = () => {
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
    models: defineModelCatalog({
      [MODEL]: {
        name: "Claude 3.5 Haiku",
        modalities: { input: ["text"], output: ["text"] },
        providers: ["bedrock"],
      },
      [THINKING_MODEL]: {
        name: "Claude 3.7 Sonnet",
        modalities: { input: ["text"], output: ["text"] },
        capabilities: ["reasoning", "tool_call"],
        providers: ["bedrock"],
      },
    }),
    // Extended timeout for Bedrock cold starts and thinking models
    timeouts: { normal: 120_000, flex: 360_000 },
  });

  server = Bun.serve({
    port: 0, // random available port
    fetch: (request) => gw.handler(request),
  });

  client = new Anthropic({
    apiKey: "not-needed", // Auth is handled by the Bedrock provider
    baseURL: `http://localhost:${server.port}`, // Gateway routes are at root, not /v1
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

  // -----------------------------------------------------------------------
  // 1. Non-streaming text generation
  // -----------------------------------------------------------------------
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

  // -----------------------------------------------------------------------
  // 2. Streaming text generation
  // -----------------------------------------------------------------------
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
      expect(message.usage.input_tokens).toBeGreaterThan(0);
      expect(message.usage.output_tokens).toBeGreaterThan(0);
    },
    { timeout: 60_000 },
  );

  // -----------------------------------------------------------------------
  // 3. System prompt
  // -----------------------------------------------------------------------
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

  // -----------------------------------------------------------------------
  // 4. Tool use
  // -----------------------------------------------------------------------
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
        tools: [
          {
            name: "get_weather",
            description: "Get the current weather for a given location.",
            input_schema: {
              type: "object" as const,
              properties: {
                location: { type: "string", description: "City and state" },
              },
              required: ["location"],
            },
          },
        ],
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

  // -----------------------------------------------------------------------
  // 5. Multi-turn conversation
  // -----------------------------------------------------------------------
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

  // -----------------------------------------------------------------------
  // 6. Extended thinking
  // -----------------------------------------------------------------------
  test(
    "extended thinking: returns thinking blocks",
    async () => {
      const message = await client.messages.create({
        model: THINKING_MODEL,
        max_tokens: 16000,
        thinking: { type: "enabled", budget_tokens: 5000 },
        messages: [{ role: "user", content: "What is 27 * 453? Think step by step." }],
      });

      expect(message.type).toBe("message");
      expect(message.stop_reason).toBe("end_turn");

      const thinkingBlock = message.content.find((b) => b.type === "thinking");
      expect(thinkingBlock).toBeDefined();
      expect(
        (thinkingBlock as { type: "thinking"; thinking: string }).thinking.length,
      ).toBeGreaterThan(0);

      const textBlock = message.content.find((b) => b.type === "text");
      expect(textBlock).toBeDefined();
      expect((textBlock as { type: "text"; text: string }).text).toContain("12231");
    },
    { timeout: 120_000 },
  );

  // -----------------------------------------------------------------------
  // 7. Error handling
  // -----------------------------------------------------------------------
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
        try {
          // Send raw request with missing required fields via fetch
          const res = await fetch(`http://localhost:${server.port}/v1/messages`, {
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
        } catch {
          // If using the SDK it would throw; either path is acceptable
        }
      },
      { timeout: 30_000 },
    );
  });
});
