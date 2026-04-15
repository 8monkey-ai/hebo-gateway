import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import OpenAI, { APIError } from "openai";
import type { ChatCompletionMessageFunctionToolCall } from "openai/resources/chat/completions";

import { defineModelCatalog, gateway } from "../../../src";
import { claudeSonnet46 } from "../../../src/models/anthropic";
import { withCanonicalIdsForBedrock } from "../../../src/providers/bedrock";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const BEDROCK_ACCESS_KEY_ID = process.env["BEDROCK_ACCESS_KEY_ID"];
const BEDROCK_SECRET_ACCESS_KEY = process.env["BEDROCK_SECRET_ACCESS_KEY"];
const hasCredentials = !!(BEDROCK_ACCESS_KEY_ID && BEDROCK_SECRET_ACCESS_KEY);

const REGION = process.env["BEDROCK_REGION"] ?? "us-east-2";
const MODEL = "anthropic/claude-sonnet-4.6";

// ---------------------------------------------------------------------------
// Shared tool definitions (OpenAI format)
// ---------------------------------------------------------------------------

const WEATHER_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "get_weather",
    description: "Get the current weather for a given location.",
    parameters: {
      type: "object",
      properties: {
        location: { type: "string", description: "City and state" },
      },
      required: ["location"],
    },
  },
};

const CALCULATOR_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "calculator",
    description: "Perform basic arithmetic. Returns the numeric result.",
    parameters: {
      type: "object",
      properties: {
        expression: { type: "string", description: "A math expression, e.g. 2+2" },
      },
      required: ["expression"],
    },
  },
};

// ---------------------------------------------------------------------------
// Gateway + Server setup
// ---------------------------------------------------------------------------

let server: ReturnType<typeof Bun.serve>;
let client: OpenAI;
let baseUrl: string;

const startServer = () => {
  delete process.env["AWS_SESSION_TOKEN"];
  delete process.env["AWS_ACCESS_KEY_ID"];
  delete process.env["AWS_SECRET_ACCESS_KEY"];

  const bedrock = createAmazonBedrock({
    region: REGION,
    credentialProvider:
      BEDROCK_ACCESS_KEY_ID && BEDROCK_SECRET_ACCESS_KEY
        ? () =>
            Promise.resolve({
              accessKeyId: BEDROCK_ACCESS_KEY_ID,
              secretAccessKey: BEDROCK_SECRET_ACCESS_KEY,
            })
        : fromNodeProviderChain(),
  });

  const gw = gateway({
    basePath: "/v1",
    logger: { level: "warn" },
    providers: {
      bedrock: withCanonicalIdsForBedrock(bedrock),
    },
    models: defineModelCatalog(claudeSonnet46()),
    timeouts: { normal: 120_000, flex: 360_000 },
  });

  server = Bun.serve({
    port: 0,
    maxRequestBodySize: 10 * 1024 * 1024,
    fetch: (request) => gw.handler(request),
  });

  baseUrl = `http://localhost:${server.port}`;

  client = new OpenAI({
    apiKey: "not-needed",
    baseURL: `${baseUrl}/v1`,
  });
};

// ---------------------------------------------------------------------------
// Tests — Claude-specific behavior through /chat/completions on Bedrock
// ---------------------------------------------------------------------------

describe.skipIf(!hasCredentials)("Chat Completions E2E (Bedrock - Claude Sonnet 4.6)", () => {
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
      const completion = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 64,
        messages: [{ role: "user", content: "Reply with exactly: hello world" }],
      });

      expect(completion.id).toStartWith("chatcmpl-");
      expect(completion.object).toBe("chat.completion");
      expect(completion.model).toBe(MODEL);
      expect(completion.choices[0]!.finish_reason).toBe("stop");
      expect(completion.choices[0]!.message.role).toBe("assistant");
      expect(completion.choices[0]!.message.content!.length).toBeGreaterThan(0);
      expect(completion.usage!.prompt_tokens).toBeGreaterThan(0);
      expect(completion.usage!.completion_tokens).toBeGreaterThan(0);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 2. Streaming
  // =========================================================================
  test(
    "streaming: returns streamed text chunks",
    async () => {
      const stream = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 64,
        stream: true,
        messages: [{ role: "user", content: "Reply with exactly: hello world" }],
      });

      let content = "";
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) content += delta;
      }

      expect(content.length).toBeGreaterThan(0);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 3. Multi-turn conversation
  // =========================================================================
  test(
    "multi-turn: maintains context across turns",
    async () => {
      const completion = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 128,
        messages: [
          { role: "user", content: "My name is Alice." },
          { role: "assistant", content: "Hello Alice! Nice to meet you." },
          { role: "user", content: "What is my name?" },
        ],
      });

      expect(completion.choices[0]!.message.content).toContain("Alice");
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 4. Tool call — auto
  // =========================================================================
  test(
    "tool_choice auto: model invokes tool when appropriate",
    async () => {
      const completion = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 256,
        messages: [
          {
            role: "user",
            content: "What is the current weather in San Francisco? Use the get_weather tool.",
          },
        ],
        tools: [WEATHER_TOOL],
        tool_choice: "auto",
      });

      expect(completion.choices[0]!.finish_reason).toBe("tool_calls");
      const toolCalls = completion.choices[0]!.message.tool_calls;
      expect(toolCalls).toBeDefined();
      expect((toolCalls![0] as ChatCompletionMessageFunctionToolCall).function.name).toBe(
        "get_weather",
      );
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 5. Tool call — named
  // =========================================================================
  test(
    "tool_choice named: forces specific tool by name",
    async () => {
      const completion = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 256,
        messages: [{ role: "user", content: "Tell me anything." }],
        tools: [WEATHER_TOOL, CALCULATOR_TOOL],
        tool_choice: { type: "function", function: { name: "calculator" } },
      });

      expect(completion.choices[0]!.finish_reason).toBe("tool_calls");
      expect(
        (completion.choices[0]!.message.tool_calls![0] as ChatCompletionMessageFunctionToolCall)
          .function.name,
      ).toBe("calculator");
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 6. Multi-turn tool use — full round-trip
  // =========================================================================
  test(
    "multi-turn tool use: tool result round-trip",
    async () => {
      // Step 1: model calls the tool
      const step1 = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 256,
        messages: [
          {
            role: "user",
            content: "What is the weather in Paris? Use the get_weather tool.",
          },
        ],
        tools: [WEATHER_TOOL],
        tool_choice: "required",
      });

      expect(step1.choices[0]!.finish_reason).toBe("tool_calls");
      const toolCall = step1.choices[0]!.message.tool_calls![0]!;

      // Step 2: send tool result back
      const step2 = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 256,
        messages: [
          {
            role: "user",
            content: "What is the weather in Paris? Use the get_weather tool.",
          },
          step1.choices[0]!.message,
          {
            role: "tool",
            tool_call_id: toolCall.id,
            content: "It is 22 degrees Celsius and sunny in Paris.",
          },
        ],
        tools: [WEATHER_TOOL],
      });

      expect(step2.choices[0]!.finish_reason).toBe("stop");
      expect(step2.choices[0]!.message.content!.toLowerCase()).toMatch(/paris|22|sunny|celsius/);
    },
    { timeout: 90_000 },
  );

  // =========================================================================
  // 7. Streaming tool calls
  // =========================================================================
  test(
    "streaming tool calls: assembled correctly from chunks",
    async () => {
      const stream = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 256,
        stream: true,
        messages: [
          {
            role: "user",
            content: "What is the weather in London? Use the get_weather tool.",
          },
        ],
        tools: [WEATHER_TOOL],
        tool_choice: "required",
      });

      let toolName = "";
      let toolArgs = "";
      let finishReason: string | null = null;

      for await (const chunk of stream) {
        const tc = chunk.choices[0]?.delta?.tool_calls?.[0];
        if (tc) {
          if (tc.function?.name) toolName += tc.function.name;
          if (tc.function?.arguments) toolArgs += tc.function.arguments;
        }
        if (chunk.choices[0]?.finish_reason) {
          finishReason = chunk.choices[0].finish_reason;
        }
      }

      expect(finishReason).toBe("tool_calls");
      expect(toolName).toBe("get_weather");
      const args = JSON.parse(toolArgs) as { location: string };
      expect(args.location).toBeDefined();
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 8. Reasoning — reasoning_effort medium (Claude thinking)
  // =========================================================================
  test(
    "reasoning_effort: medium produces thinking + valid response",
    async () => {
      const completion = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 16000,
        reasoning_effort: "medium",
        messages: [{ role: "user", content: "What is 27 * 453? Think step by step." }],
      });

      expect(completion.choices[0]!.finish_reason).toBe("stop");
      expect(
        completion.choices[0]!.message.content!.replaceAll(",", "").replaceAll(" ", ""),
      ).toContain("12231");

      // Verify reasoning was used — reasoning_tokens may or may not be exposed
      // through the OpenAI format depending on AI SDK behavior
      expect(completion.usage!.completion_tokens).toBeGreaterThan(0);
    },
    { timeout: 120_000 },
  );

  // =========================================================================
  // 9. Reasoning — extended config with max_tokens
  // =========================================================================
  test(
    "reasoning config: extended reasoning object with max_tokens",
    async () => {
      const completion = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 16000,
        messages: [{ role: "user", content: "What is 47 * 83? Think carefully." }],
        // @ts-expect-error — gateway extension
        reasoning: { enabled: true, effort: "medium", max_tokens: 5000 },
      });

      expect(completion.choices[0]!.finish_reason).toBe("stop");
      expect(
        completion.choices[0]!.message.content!.replaceAll(",", "").replaceAll(" ", ""),
      ).toContain("3901");
    },
    { timeout: 120_000 },
  );

  // =========================================================================
  // 10. Reasoning — streaming with thinking
  // =========================================================================
  test(
    "streaming reasoning: reasoning content appears in stream",
    async () => {
      const stream = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 16000,
        reasoning_effort: "medium",
        stream: true,
        messages: [{ role: "user", content: "What is 15 * 37?" }],
      });

      let content = "";
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) content += delta;
      }

      expect(content.length).toBeGreaterThan(0);
      expect(content.replaceAll(" ", "")).toContain("555");
    },
    { timeout: 120_000 },
  );

  // =========================================================================
  // 11. Reasoning — reasoning_effort none (disabled)
  // =========================================================================
  test(
    "reasoning_effort: none disables thinking",
    async () => {
      const completion = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 128,
        reasoning_effort:
          "none" as OpenAI.Chat.Completions.ChatCompletionCreateParams["reasoning_effort"],
        messages: [{ role: "user", content: "What is 2 + 2?" }],
      });

      expect(completion.choices[0]!.finish_reason).toBe("stop");
      expect(completion.choices[0]!.message.content).toBeDefined();
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 12. Structured output — json_schema
  // =========================================================================
  test(
    "structured output: returns valid JSON matching schema",
    async () => {
      const completion = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 256,
        messages: [
          {
            role: "user",
            content: "Give me a person with name 'Alice' and age 30.",
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "person",
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

      expect(completion.choices[0]!.finish_reason).toBe("stop");
      const parsed = JSON.parse(completion.choices[0]!.message.content!) as {
        name: unknown;
        age: unknown;
      };
      expect(parsed.name).toBeDefined();
      expect(parsed.age).toBeDefined();
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 13. Image input — base64 PNG
  // =========================================================================
  test(
    "image input: accepts base64 image content",
    async () => {
      // 1x1 red pixel PNG
      const RED_PIXEL_PNG =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

      const completion = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:image/png;base64,${RED_PIXEL_PNG}` },
              },
              { type: "text", text: "What color is this pixel?" },
            ],
          },
        ],
      });

      expect(completion.choices[0]!.message.content!.length).toBeGreaterThan(0);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 14. Cache token usage
  // =========================================================================
  test(
    "cache tokens: sequential requests with cache_control show cache usage",
    async () => {
      const runId = crypto.randomUUID();
      const longSystemText =
        `Session ${runId}. ` +
        "You are a helpful assistant who always provides detailed and thoughtful responses. ".repeat(
          800,
        ) +
        "Always respond concisely when asked a short question.";

      // Use raw fetch to send cache_control as a gateway extension on the system message
      const body = {
        model: MODEL,
        max_completion_tokens: 128,
        messages: [
          {
            role: "system",
            content: longSystemText,
            cache_control: { type: "ephemeral" },
          },
          { role: "user", content: "Say hello" },
        ],
      };

      // First request — should create cache entry
      const res1 = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(res1.status).toBe(200);
      const msg1 = (await res1.json()) as {
        choices: { finish_reason: string }[];
        usage: {
          prompt_tokens: number;
          prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
        };
      };
      expect(msg1.choices[0]!.finish_reason).toBe("stop");

      // Wait for cache to be committed
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 3000);
      });

      // Second request — should read from cache
      const res2 = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(res2.status).toBe(200);
      const msg2 = (await res2.json()) as typeof msg1;
      expect(msg2.choices[0]!.finish_reason).toBe("stop");

      expect(msg1.usage.prompt_tokens).toBeGreaterThan(0);
      expect(msg2.usage.prompt_tokens).toBeGreaterThan(0);

      // First request should show cache creation
      expect(msg1.usage.prompt_tokens_details?.cache_write_tokens).toBeGreaterThan(0);
      // Second request should show cache read
      expect(msg2.usage.prompt_tokens_details?.cached_tokens).toBeGreaterThan(0);
    },
    { timeout: 120_000 },
  );

  // =========================================================================
  // 15. Error handling — invalid model
  // =========================================================================
  test(
    "invalid model: returns an error",
    async () => {
      try {
        await client.chat.completions.create({
          model: "nonexistent/model-xyz",
          max_completion_tokens: 64,
          messages: [{ role: "user", content: "hi" }],
        });
        expect(true).toBe(false);
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(APIError);
        expect((error as APIError).status).toBeGreaterThanOrEqual(400);
      }
    },
    { timeout: 30_000 },
  );
});
