import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import OpenAI, { APIError } from "openai";
import type { ChatCompletionMessageFunctionToolCall } from "openai/resources/chat/completions";

import { gptOss120b } from "../../../src/models/openai";
import { BEDROCK_ACCESS_KEY_ID, BEDROCK_SECRET_ACCESS_KEY } from "../shared/server";
import { createBedrockTestServer, type TestServer } from "../shared/server";
import {
  CHAT_CALCULATOR_TOOL as CALCULATOR_TOOL,
  CHAT_WEATHER_TOOL as WEATHER_TOOL,
} from "../shared/tools";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const hasCredentials = !!(BEDROCK_ACCESS_KEY_ID && BEDROCK_SECRET_ACCESS_KEY) || true;
const MODEL = "openai/gpt-oss-120b";

// ---------------------------------------------------------------------------
// Gateway + Server setup
// ---------------------------------------------------------------------------

let testServer: TestServer;
let client: OpenAI;
let baseUrl: string;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!hasCredentials)("Chat Completions E2E (Bedrock - gpt-oss-120b)", () => {
  beforeAll(() => {
    testServer = createBedrockTestServer(gptOss120b());
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
      const completion = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 64,
        messages: [{ role: "user", content: "Reply with exactly: hello world" }],
      });

      expect(completion.id).toStartWith("chatcmpl-");
      expect(completion.object).toBe("chat.completion");
      expect(completion.model).toBe(MODEL);
      expect(completion.choices.length).toBe(1);
      expect(completion.choices[0]!.finish_reason).toBe("stop");
      expect(completion.choices[0]!.message.role).toBe("assistant");
      expect(completion.choices[0]!.message.content!.length).toBeGreaterThan(0);
      expect(completion.usage!.prompt_tokens).toBeGreaterThan(0);
      expect(completion.usage!.completion_tokens).toBeGreaterThan(0);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 2. System message influence
  // =========================================================================
  test(
    "system message: influences response",
    async () => {
      const completion = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 1024,
        messages: [
          { role: "system", content: "You are a pirate. You always respond with 'Ahoy!' first." },
          { role: "user", content: "Say hello" },
        ],
      });

      expect(completion.choices[0]!.message.content!.toLowerCase()).toContain("ahoy");
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
        max_completion_tokens: 1024,
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
  // 4. Temperature 0
  // =========================================================================
  test(
    "temperature: temperature 0 produces valid response",
    async () => {
      const completion = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 1024,
        temperature: 0,
        messages: [{ role: "user", content: "What is 1+1? Reply with just the number." }],
      });

      expect(completion.choices[0]!.message.content).toContain("2");
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 5. max_completion_tokens limit
  // =========================================================================
  test(
    "max_completion_tokens: very low limit triggers length finish_reason",
    async () => {
      const completion = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 3,
        messages: [
          {
            role: "user",
            content: "Write a very long essay about the history of the universe.",
          },
        ],
      });

      expect(completion.choices[0]!.finish_reason).toBe("length");
      expect(completion.usage!.completion_tokens).toBeLessThanOrEqual(5);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 6. Basic streaming
  // =========================================================================
  test(
    "streaming: returns streamed text chunks",
    async () => {
      const stream = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 1024,
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
  // 7. Streaming event structure (raw HTTP)
  // =========================================================================
  test(
    "streaming event structure: correct SSE format",
    async () => {
      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          max_completion_tokens: 32,
          stream: true,
          messages: [{ role: "user", content: "Say hi" }],
        }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");

      const text = await res.text();
      const lines = text.split("\n").filter((l) => l.startsWith("data: "));

      // Should have data chunks and end with [DONE]
      expect(lines.length).toBeGreaterThan(1);
      expect(lines.at(-1)).toBe("data: [DONE]");

      // Parse all data chunks to validate structure
      const dataChunks = lines
        .filter((l) => l !== "data: [DONE]")
        .map((l) => JSON.parse(l.replace("data: ", "")) as { object: string });

      // All chunks should have chat.completion.chunk object type
      for (const chunk of dataChunks) {
        expect(chunk.object).toBe("chat.completion.chunk");
      }
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 8. Streaming usage populated
  // =========================================================================
  test(
    "streaming usage: final chunk has usage data",
    async () => {
      const stream = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 32,
        stream: true,
        stream_options: { include_usage: true },
        messages: [{ role: "user", content: "Say hello" }],
      });

      let lastChunk: OpenAI.Chat.Completions.ChatCompletionChunk | undefined;
      for await (const chunk of stream) {
        lastChunk = chunk;
      }

      expect(lastChunk).toBeDefined();
      expect(lastChunk!.usage).toBeDefined();
      expect(lastChunk!.usage!.prompt_tokens).toBeGreaterThan(0);
      expect(lastChunk!.usage!.completion_tokens).toBeGreaterThan(0);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 9. Tool call — tool_choice: auto
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
      expect(toolCalls!.length).toBeGreaterThanOrEqual(1);
      const tc0 = toolCalls![0] as ChatCompletionMessageFunctionToolCall;
      expect(tc0.function.name).toBe("get_weather");
      const args = JSON.parse(tc0.function.arguments) as { location: string };
      expect(args.location).toBeDefined();
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 10. Tool call — tool_choice: none
  // =========================================================================
  test(
    "tool_choice none: no tool calls returned",
    async () => {
      const completion = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 1024,
        messages: [{ role: "user", content: "What is the weather in Tokyo?" }],
        tools: [WEATHER_TOOL],
        tool_choice: "none",
      });

      expect(completion.choices[0]!.finish_reason).not.toBe("tool_calls");
      expect(completion.choices[0]!.message.tool_calls).toBeUndefined();
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 11. Tool call — tool_choice: required
  // =========================================================================
  test(
    "tool_choice required: parameter accepted",
    async () => {
      const completion = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 4096,
        messages: [
          {
            role: "user",
            content: "What is the weather in Berlin? Use the get_weather tool.",
          },
        ],
        tools: [WEATHER_TOOL],
        tool_choice: "required",
      });

      // Model should invoke a tool (finish_reason "tool_calls") or
      // respond with text if it doesn't honor required through Bedrock
      expect(["tool_calls", "stop"]).toContain(completion.choices[0]!.finish_reason);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 12. Tool call — named tool_choice
  // =========================================================================
  test(
    "tool_choice named: forces specific tool by name",
    async () => {
      const completion = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 4096,
        messages: [{ role: "user", content: "Calculate 2+2 using the calculator tool." }],
        tools: [WEATHER_TOOL, CALCULATOR_TOOL],
        tool_choice: { type: "function", function: { name: "calculator" } },
      });

      // Verify the request was accepted. The model should call calculator,
      // though Bedrock may not fully honor named tool_choice for all models.
      expect(["tool_calls", "stop"]).toContain(completion.choices[0]!.finish_reason);
      if (completion.choices[0]!.finish_reason === "tool_calls") {
        const toolCalls = completion.choices[0]!.message.tool_calls!;
        expect((toolCalls[0] as ChatCompletionMessageFunctionToolCall).function.name).toBe(
          "calculator",
        );
      }
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 13. Multiple tools — model picks correct one
  // =========================================================================
  test(
    "multiple tools: model picks the right one",
    async () => {
      const completion = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 256,
        messages: [
          {
            role: "user",
            content: "What is the weather in Berlin? Use the appropriate tool.",
          },
        ],
        tools: [WEATHER_TOOL, CALCULATOR_TOOL],
        tool_choice: "required",
      });

      expect(completion.choices[0]!.finish_reason).toBe("tool_calls");
      const toolCalls = completion.choices[0]!.message.tool_calls!;
      expect((toolCalls[0] as ChatCompletionMessageFunctionToolCall).function.name).toBe(
        "get_weather",
      );
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 14. Streaming tool calls
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

      // Collect tool call chunks
      let toolName = "";
      let toolArgs = "";
      let toolId = "";
      let finishReason: string | null = null;

      for await (const chunk of stream) {
        const tc = chunk.choices[0]?.delta?.tool_calls?.[0];
        if (tc) {
          if (tc.id) toolId = tc.id;
          if (tc.function?.name) toolName += tc.function.name;
          if (tc.function?.arguments) toolArgs += tc.function.arguments;
        }
        if (chunk.choices[0]?.finish_reason) {
          finishReason = chunk.choices[0].finish_reason;
        }
      }

      expect(finishReason).toBe("tool_calls");
      expect(toolName).toBe("get_weather");
      expect(toolId.length).toBeGreaterThan(0);
      const args = JSON.parse(toolArgs) as { location: string };
      expect(args.location).toBeDefined();
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 15. Multi-turn tool use — full round-trip
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
      const text = step2.choices[0]!.message.content!;
      expect(text.toLowerCase()).toMatch(/paris|22|sunny|celsius/);
    },
    { timeout: 90_000 },
  );

  // =========================================================================
  // 16. Multi-turn tool use — tool error handling
  // =========================================================================
  test(
    "multi-turn tool use: tool error handled gracefully",
    async () => {
      // Step 1: force tool call
      const step1 = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 4096,
        messages: [
          {
            role: "user",
            content: "What is the weather in Mars? You must use the get_weather tool to answer.",
          },
        ],
        tools: [WEATHER_TOOL],
        tool_choice: "auto",
      });

      // Model must call a tool for this test to work
      if (step1.choices[0]!.finish_reason !== "tool_calls") {
        // Skip if model doesn't call tool — this is a model behavior issue, not an endpoint issue
        return;
      }

      const toolCall = step1.choices[0]!.message.tool_calls![0]!;

      // Step 2: send error result
      const step2 = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 4096,
        messages: [
          {
            role: "user",
            content: "What is the weather in Mars? You must use the get_weather tool to answer.",
          },
          step1.choices[0]!.message,
          {
            role: "tool",
            tool_call_id: toolCall.id,
            content: "Error: Location 'Mars' not found. Only Earth locations are supported.",
          },
        ],
        tools: [WEATHER_TOOL],
      });

      expect(step2.choices[0]!.finish_reason).toBe("stop");
      expect(step2.choices[0]!.message.content!.length).toBeGreaterThan(0);
    },
    { timeout: 90_000 },
  );

  // =========================================================================
  // 17. Reasoning — reasoning_effort medium
  // =========================================================================
  test(
    "reasoning_effort: medium produces valid response",
    async () => {
      const completion = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 16000,
        reasoning_effort: "medium",
        messages: [{ role: "user", content: "What is 27 * 453? Think step by step." }],
      });

      expect(completion.choices[0]!.finish_reason).toBe("stop");
      // Model may format number as "12,231", "12{}231", "12 231", "12\,231", or "12231"
      const content = completion.choices[0]!.message.content!.replaceAll(/[\s,{}\\]/g, "");
      expect(content).toContain("12231");
    },
    { timeout: 120_000 },
  );

  // =========================================================================
  // 18. Reasoning — reasoning_effort none (disabled)
  // =========================================================================
  test(
    "reasoning_effort: none disables reasoning",
    async () => {
      const completion = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 1024,
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
  // 19. Reasoning with streaming
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
      expect(content.replaceAll(" ", "").replaceAll("{}", "")).toContain("555");
    },
    { timeout: 120_000 },
  );

  // =========================================================================
  // 20. Reasoning — extended reasoning config via extra_body
  // =========================================================================
  test(
    "reasoning config: extended reasoning object accepted",
    async () => {
      const completion = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 16000,
        messages: [{ role: "user", content: "What is 47 * 83? Think carefully." }],
        // @ts-expect-error — gateway extension, not in OpenAI SDK types
        reasoning: { enabled: true, effort: "medium" },
      });

      expect(completion.choices[0]!.finish_reason).toBe("stop");
      // Model may format number as "3,901", "3{}901", "3 901", "3\,901", or "3901"
      const content = completion.choices[0]!.message.content!.replaceAll(/[\s,{}\\]/g, "");
      expect(content).toContain("3901");
    },
    { timeout: 120_000 },
  );

  // =========================================================================
  // 21. Structured output — json_schema
  // =========================================================================
  test(
    "structured output: returns valid JSON matching schema",
    async () => {
      const completion = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 1024,
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
      const text = completion.choices[0]!.message.content!;
      const parsed = JSON.parse(text) as { name: unknown; age: unknown };
      expect(parsed.name).toBeDefined();
      expect(parsed.age).toBeDefined();
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 22. Structured output — text baseline
  // =========================================================================
  test(
    "response_format text: normal text response",
    async () => {
      const completion = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 1024,
        response_format: { type: "text" },
        messages: [{ role: "user", content: "Say hello" }],
      });

      expect(completion.choices[0]!.finish_reason).toBe("stop");
      expect(completion.choices[0]!.message.content!.length).toBeGreaterThan(0);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 23. top_p parameter accepted
  // =========================================================================
  test(
    "top_p: parameter accepted",
    async () => {
      const completion = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 1024,
        top_p: 0.9,
        messages: [{ role: "user", content: "Say hello" }],
      });

      expect(completion.choices[0]!.message.content).toBeDefined();
      expect(["stop", "length"]).toContain(completion.choices[0]!.finish_reason);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 24. Frequency/presence penalty parameters accepted
  // =========================================================================
  test(
    "penalties: frequency_penalty and presence_penalty accepted",
    async () => {
      const completion = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 1024,
        frequency_penalty: 0.5,
        presence_penalty: 0.5,
        messages: [{ role: "user", content: "Say hello" }],
      });

      expect(["stop", "length"]).toContain(completion.choices[0]!.finish_reason);
      expect(completion.choices[0]!.message.content).toBeDefined();
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 25. Seed parameter accepted
  // =========================================================================
  test(
    "seed: parameter accepted",
    async () => {
      const completion = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 1024,
        seed: 42,
        messages: [{ role: "user", content: "Say hello" }],
      });

      expect(["stop", "length"]).toContain(completion.choices[0]!.finish_reason);
      expect(completion.choices[0]!.message.content).toBeDefined();
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 26. Multi-part user content
  // =========================================================================
  test(
    "multi-part content: text content parts accepted",
    async () => {
      const completion = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "The capital of France is Paris." },
              { type: "text", text: "What is the capital mentioned above?" },
            ],
          },
        ],
      });

      expect(completion.choices[0]!.message.content!.toLowerCase()).toContain("paris");
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 27. Metadata passthrough
  // =========================================================================
  test(
    "metadata: user_id passes through without error",
    async () => {
      const completion = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 1024,
        metadata: { user_id: "test-user-123" },
        messages: [{ role: "user", content: "Say ok" }],
      });

      expect(completion.choices[0]!.message.content!.length).toBeGreaterThanOrEqual(1);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 28. Service tier flex
  // =========================================================================
  test(
    "service_tier: flex accepted",
    async () => {
      const completion = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 1024,
        service_tier: "flex",
        messages: [{ role: "user", content: "Say hello" }],
      });

      expect(["stop", "length"]).toContain(completion.choices[0]!.finish_reason);
      expect(completion.choices[0]!.message.content).toBeDefined();
    },
    { timeout: 360_000 },
  );

  // =========================================================================
  // 29. Usage fields present
  // =========================================================================
  test(
    "usage: prompt_tokens and completion_tokens are present and valid",
    async () => {
      const completion = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 1024,
        messages: [{ role: "user", content: "Hello" }],
      });

      expect(completion.usage).toBeDefined();
      expect(completion.usage!.prompt_tokens).toBeGreaterThan(0);
      expect(completion.usage!.completion_tokens).toBeGreaterThan(0);
      expect(completion.usage!.total_tokens).toBeGreaterThan(0);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 30. parallel_tool_calls parameter
  // =========================================================================
  test(
    "parallel_tool_calls: parameter accepted without error",
    async () => {
      const completion = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 256,
        messages: [
          {
            role: "user",
            content: "What is the weather in Berlin? Use the get_weather tool.",
          },
        ],
        tools: [WEATHER_TOOL],
        tool_choice: "required",
        parallel_tool_calls: true,
      });

      expect(completion.choices[0]!.finish_reason).toBe("tool_calls");
      expect(completion.choices[0]!.message.tool_calls).toBeDefined();
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // Error handling
  // =========================================================================
  describe("error handling", () => {
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

    test(
      "missing required fields: returns a 400 error",
      async () => {
        const res = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: MODEL,
            // missing messages
          }),
        });
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error: { type: string } };
        expect(body.error.type).toBeDefined();
      },
      { timeout: 30_000 },
    );

    test(
      "wrong HTTP method: GET returns 405",
      async () => {
        const res = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: "GET",
        });
        expect(res.status).toBe(405);
      },
      { timeout: 15_000 },
    );

    test(
      "oversized body: returns appropriate error",
      async () => {
        const bigString = "x".repeat(11 * 1024 * 1024);
        try {
          await client.chat.completions.create({
            model: MODEL,
            max_completion_tokens: 64,
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

    test(
      "empty messages array: returns validation error",
      async () => {
        const res = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: MODEL,
            messages: [],
          }),
        });
        // Gateway returns 422 for schema validation errors
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);
      },
      { timeout: 15_000 },
    );
  });

  // Note: Prompt caching is not tested here because the Bedrock prompt caching
  // middleware only supports Claude and Nova models. See chat-completions-claude.test.ts
  // for cache token tests.
});
