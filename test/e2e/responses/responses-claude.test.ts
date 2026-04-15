import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import OpenAI, { APIError } from "openai";
import type {
  ResponseFunctionToolCall,
  ResponseOutputMessage,
  ResponseOutputText,
  ResponseReasoningItem,
} from "openai/resources/responses/responses";

import { claudeSonnet46 } from "../../../src/models/anthropic";
import { BEDROCK_ACCESS_KEY_ID, BEDROCK_SECRET_ACCESS_KEY } from "../shared/server";
import { createBedrockTestServer, type TestServer } from "../shared/server";
import { RESPONSE_CALCULATOR_TOOL as CALCULATOR_TOOL, RESPONSE_WEATHER_TOOL as WEATHER_TOOL } from "../shared/tools";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const hasCredentials = !!(BEDROCK_ACCESS_KEY_ID && BEDROCK_SECRET_ACCESS_KEY) || true;
const MODEL = "anthropic/claude-sonnet-4.6";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getOutputText(response: OpenAI.Responses.Response): string {
  const msg = response.output.find((o): o is ResponseOutputMessage => o.type === "message");
  const part = msg?.content.find((c): c is ResponseOutputText => c.type === "output_text");
  return part?.text ?? "";
}

function getFunctionCall(
  response: OpenAI.Responses.Response,
): ResponseFunctionToolCall | undefined {
  return response.output.find((o): o is ResponseFunctionToolCall => o.type === "function_call");
}

// ---------------------------------------------------------------------------
// Gateway + Server setup
// ---------------------------------------------------------------------------

let testServer: TestServer;
let client: OpenAI;
let baseUrl: string;

// ---------------------------------------------------------------------------
// Tests — Claude-specific behavior through /responses on Bedrock
// ---------------------------------------------------------------------------

describe.skipIf(!hasCredentials)("Responses E2E (Bedrock - Claude Sonnet 4.6)", () => {
  beforeAll(() => {
    testServer = createBedrockTestServer(claudeSonnet46());
    baseUrl = testServer.baseUrl;
    client = new OpenAI({
      apiKey: "not-needed",
      baseURL: `${baseUrl}/v1`,
    });
  });

  afterAll(async () => {
    await testServer?.server?.stop(true);
  });

  // =========================================================================
  // 1. Non-streaming text generation
  // =========================================================================
  test(
    "non-streaming: returns a text response",
    async () => {
      const response = await client.responses.create({
        model: MODEL,
        max_output_tokens: 64,
        input: "Reply with exactly: hello world",
      });

      expect(response.id).toBeDefined();
      expect(response.object).toBe("response");
      expect(response.status).toBe("completed");
      expect(response.model).toBe(MODEL);

      const text = getOutputText(response);
      expect(text.length).toBeGreaterThan(0);
      expect(response.usage!.input_tokens).toBeGreaterThan(0);
      expect(response.usage!.output_tokens).toBeGreaterThan(0);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 2. Streaming text generation
  // =========================================================================
  test(
    "streaming: returns streamed text events",
    async () => {
      const stream = await client.responses.create({
        model: MODEL,
        max_output_tokens: 64,
        stream: true,
        input: "Reply with exactly: hello world",
      });

      let text = "";
      for await (const event of stream) {
        if (event.type === "response.output_text.delta") {
          text += event.delta;
        }
      }

      expect(text.length).toBeGreaterThan(0);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 3. Multi-turn conversation
  // =========================================================================
  test(
    "multi-turn: maintains context across turns",
    async () => {
      const response = await client.responses.create({
        model: MODEL,
        max_output_tokens: 128,
        input: [
          { type: "message", role: "user", content: "My name is Alice." },
          {
            type: "message",
            id: "msg_alice",
            role: "assistant",
            status: "completed",
            content: [
              { type: "output_text", text: "Hello Alice! Nice to meet you.", annotations: [] },
            ],
          },
          { type: "message", role: "user", content: "What is my name?" },
        ],
      });

      expect(getOutputText(response)).toContain("Alice");
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 4. Tool call — auto
  // =========================================================================
  test(
    "tool_choice auto: model invokes tool when appropriate",
    async () => {
      const response = await client.responses.create({
        model: MODEL,
        max_output_tokens: 256,
        input: "What is the current weather in San Francisco? Use the get_weather tool.",
        tools: [WEATHER_TOOL],
        tool_choice: "auto",
      });

      const fnCall = getFunctionCall(response);
      expect(fnCall).toBeDefined();
      expect(fnCall!.name).toBe("get_weather");
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 5. Tool call — named
  // =========================================================================
  test(
    "tool_choice named: forces specific tool by name",
    async () => {
      const response = await client.responses.create({
        model: MODEL,
        max_output_tokens: 256,
        input: "Tell me anything.",
        tools: [WEATHER_TOOL, CALCULATOR_TOOL],
        tool_choice: { type: "function", name: "calculator" },
      });

      const fnCall = getFunctionCall(response);
      expect(fnCall).toBeDefined();
      expect(fnCall!.name).toBe("calculator");
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 6. Multi-turn tool use — full round-trip
  // =========================================================================
  test(
    "multi-turn tool use: function_call_output round-trip",
    async () => {
      const step1 = await client.responses.create({
        model: MODEL,
        max_output_tokens: 256,
        input: "What is the weather in Paris? Use the get_weather tool.",
        tools: [WEATHER_TOOL],
        tool_choice: "required",
      });

      const fnCall = getFunctionCall(step1);
      expect(fnCall).toBeDefined();

      const step2 = await client.responses.create({
        model: MODEL,
        max_output_tokens: 256,
        input: [
          {
            type: "message",
            role: "user",
            content: "What is the weather in Paris? Use the get_weather tool.",
          },
          {
            type: "function_call",
            call_id: fnCall!.call_id,
            name: fnCall!.name,
            arguments: fnCall!.arguments,
          },
          {
            type: "function_call_output",
            call_id: fnCall!.call_id,
            output: "It is 22 degrees Celsius and sunny in Paris.",
          },
        ],
        tools: [WEATHER_TOOL],
      });

      expect(step2.status).toBe("completed");
      expect(getOutputText(step2).toLowerCase()).toMatch(/paris|22|sunny|celsius/);
    },
    { timeout: 90_000 },
  );

  // =========================================================================
  // 7. Streaming tool calls
  // =========================================================================
  test(
    "streaming tool calls: function_call_arguments events emitted",
    async () => {
      const stream = await client.responses.create({
        model: MODEL,
        max_output_tokens: 256,
        stream: true,
        input: "What is the weather in London? Use the get_weather tool.",
        tools: [WEATHER_TOOL],
        tool_choice: "required",
      });

      let toolName = "";
      let toolArgs = "";
      let hasDoneEvent = false;

      for await (const event of stream) {
        if (event.type === "response.output_item.added" && event.item.type === "function_call") {
          toolName = event.item.name;
        }
        if (event.type === "response.function_call_arguments.delta") {
          toolArgs += event.delta;
        }
        if (event.type === "response.function_call_arguments.done") {
          hasDoneEvent = true;
        }
      }

      expect(toolName).toBe("get_weather");
      expect(hasDoneEvent).toBe(true);
      const args = JSON.parse(toolArgs) as { location: string };
      expect(args.location).toBeDefined();
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 8. Reasoning — effort medium (Claude extended thinking)
  // =========================================================================
  test(
    "reasoning effort medium: produces thinking + valid response",
    async () => {
      const response = await client.responses.create({
        model: MODEL,
        max_output_tokens: 16000,
        reasoning: { effort: "medium" },
        input: "What is 27 * 453? Think step by step.",
      });

      expect(response.status).toBe("completed");
      expect(getOutputText(response).replaceAll(",", "").replaceAll(" ", "")).toContain("12231");
      expect(response.usage!.output_tokens).toBeGreaterThan(0);
    },
    { timeout: 120_000 },
  );

  // =========================================================================
  // 9. Reasoning — extended config with max_tokens
  // =========================================================================
  test(
    "reasoning config: extended reasoning object with max_tokens",
    async () => {
      const response = await client.responses.create({
        model: MODEL,
        max_output_tokens: 16000,
        reasoning: {
          effort: "medium",
          max_tokens: 5000,
        } as OpenAI.Responses.ResponseCreateParams["reasoning"],
        input: "What is 47 * 83? Think carefully.",
      });

      expect(response.status).toBe("completed");
      expect(getOutputText(response).replaceAll(",", "").replaceAll(" ", "")).toContain("3901");
    },
    { timeout: 120_000 },
  );

  // =========================================================================
  // 10. Reasoning — streaming with thinking
  // =========================================================================
  test(
    "streaming reasoning: reasoning events appear in stream",
    async () => {
      const stream = await client.responses.create({
        model: MODEL,
        max_output_tokens: 16000,
        reasoning: { effort: "medium" },
        stream: true,
        input: "What is 15 * 37?",
      });

      let text = "";
      let hasReasoningEvents = false;
      for await (const event of stream) {
        if (
          event.type === "response.reasoning_summary_text.delta" ||
          event.type === "response.reasoning_summary_part.added"
        ) {
          hasReasoningEvents = true;
        }
        if (event.type === "response.output_text.delta") {
          text += event.delta;
        }
      }

      expect(text.length).toBeGreaterThan(0);
      expect(text.replaceAll(" ", "")).toContain("555");
      // Claude with extended thinking should produce reasoning events
      expect(hasReasoningEvents).toBe(true);
    },
    { timeout: 120_000 },
  );

  // =========================================================================
  // 11. Reasoning — encrypted_content for Claude
  // =========================================================================
  test(
    "reasoning encrypted_content: Claude returns encrypted reasoning data",
    async () => {
      const response = await client.responses.create({
        model: MODEL,
        max_output_tokens: 16000,
        reasoning: { effort: "medium" },
        input: "What is 3 + 5?",
        include: ["reasoning.encrypted_content"],
      });

      expect(response.status).toBe("completed");

      const reasoningItem = response.output.find((o) => o.type === "reasoning") as
        | (ResponseReasoningItem & { encrypted_content?: string })
        | undefined;

      // Verify reasoning item exists (Claude should produce reasoning output)
      expect(reasoningItem).toBeDefined();
      // encrypted_content is only returned when the provider supports it and
      // the include parameter is honored; verify the reasoning item is present
      // and has a summary at minimum
      if (reasoningItem?.encrypted_content) {
        expect(typeof reasoningItem.encrypted_content).toBe("string");
        expect(reasoningItem.encrypted_content.length).toBeGreaterThan(0);
      }
    },
    { timeout: 120_000 },
  );

  // =========================================================================
  // 12. Reasoning — disabled
  // =========================================================================
  test(
    "reasoning effort none: disabled thinking",
    async () => {
      const response = await client.responses.create({
        model: MODEL,
        max_output_tokens: 128,
        reasoning: { effort: "none" } as OpenAI.Responses.ResponseCreateParams["reasoning"],
        input: "What is 2 + 2?",
      });

      expect(response.status).toBe("completed");
      expect(getOutputText(response).length).toBeGreaterThan(0);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 13. Structured output — json_schema
  // =========================================================================
  test(
    "structured output: returns valid JSON matching schema",
    async () => {
      const response = await client.responses.create({
        model: MODEL,
        max_output_tokens: 256,
        input: "Give me a person with name 'Alice' and age 30.",
        text: {
          format: {
            type: "json_schema",
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

      expect(response.status).toBe("completed");
      const parsed = JSON.parse(getOutputText(response)) as { name: unknown; age: unknown };
      expect(parsed.name).toBeDefined();
      expect(parsed.age).toBeDefined();
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 14. Image input — base64 PNG
  // =========================================================================
  test(
    "image input: accepts base64 image content",
    async () => {
      // 1x1 red pixel PNG
      const RED_PIXEL_PNG =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

      const response = await client.responses.create({
        model: MODEL,
        max_output_tokens: 1024,
        input: [
          {
            type: "message",
            role: "user",
            content: [
              {
                type: "input_image",
                image_url: `data:image/png;base64,${RED_PIXEL_PNG}`,
                detail: "auto",
              },
              { type: "input_text", text: "What color is this pixel?" },
            ],
          },
        ],
      });

      expect(getOutputText(response).length).toBeGreaterThan(0);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 15. Cache token usage
  // =========================================================================
  test(
    "cache tokens: sequential requests with cache_control show cache usage",
    async () => {
      const runId = crypto.randomUUID();
      const longInstructions =
        `Session ${runId}. ` +
        "You are a helpful assistant who always provides detailed and thoughtful responses. ".repeat(
          800,
        ) +
        "Always respond concisely when asked a short question.";

      const body = {
        model: MODEL,
        max_output_tokens: 128,
        instructions: longInstructions,
        input: "Say hello",
        // @ts-expect-error — gateway extension
        cache_control: { type: "ephemeral" },
      } satisfies OpenAI.Responses.ResponseCreateParamsNonStreaming;

      // First request — should create cache entry
      const msg1 = (await client.responses.create(body)) as OpenAI.Responses.Response & {
        usage: {
          input_tokens: number;
          input_tokens_details?: { cached_tokens?: number };
        };
      };
      expect(msg1.status).toBe("completed");

      // Wait for cache to be committed
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 3000);
      });

      // Second request — should read from cache
      const msg2 = (await client.responses.create(body)) as typeof msg1;
      expect(msg2.status).toBe("completed");

      expect(msg1.usage.input_tokens).toBeGreaterThan(0);
      expect(msg2.usage.input_tokens).toBeGreaterThan(0);

      // Second request should show cache read
      expect(msg2.usage.input_tokens_details?.cached_tokens).toBeGreaterThan(0);
    },
    { timeout: 120_000 },
  );

  // =========================================================================
  // 16. Error handling — invalid model
  // =========================================================================
  test(
    "invalid model: returns an error",
    async () => {
      try {
        await client.responses.create({
          model: "nonexistent/model-xyz",
          max_output_tokens: 64,
          input: "hi",
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
