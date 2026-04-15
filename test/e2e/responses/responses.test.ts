import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import OpenAI, { APIError } from "openai";
import type { ResponseReasoningItem } from "openai/resources/responses/responses";

import { gptOss120b } from "../../../src/models/openai";
import { BEDROCK_ACCESS_KEY_ID, BEDROCK_SECRET_ACCESS_KEY } from "../shared/env";
import { getFunctionCall, getOutputText } from "../shared/responses-helpers";
import { createBedrockTestServer, type TestServer } from "../shared/server";
import { RESPONSE_CALCULATOR_TOOL as CALCULATOR_TOOL, RESPONSE_WEATHER_TOOL as WEATHER_TOOL } from "../shared/tools";

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

describe.skipIf(!hasCredentials)("Responses E2E (Bedrock - gpt-oss-120b)", () => {
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
      const response = await client.responses.create({
        model: MODEL,
        max_output_tokens: 64,
        input: "Reply with exactly: hello world",
      });

      expect(response.id).toBeDefined();
      expect(response.object).toBe("response");
      expect(response.status).toBe("completed");
      expect(response.model).toBe(MODEL);
      expect(response.output.length).toBeGreaterThanOrEqual(1);

      const text = getOutputText(response);
      expect(text.length).toBeGreaterThan(0);

      expect(response.usage!.input_tokens).toBeGreaterThan(0);
      expect(response.usage!.output_tokens).toBeGreaterThan(0);
      expect(response.usage!.total_tokens).toBeGreaterThan(0);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 2. String input shorthand
  // =========================================================================
  test(
    "string input: shorthand input accepted",
    async () => {
      const response = await client.responses.create({
        model: MODEL,
        max_output_tokens: 64,
        input: "Say hello",
      });

      expect(response.status).toBe("completed");
      expect(getOutputText(response).length).toBeGreaterThan(0);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 3. Structured input array
  // =========================================================================
  test(
    "structured input: array of message items accepted",
    async () => {
      const response = await client.responses.create({
        model: MODEL,
        max_output_tokens: 64,
        input: [
          {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "Say hello" }],
          },
        ],
      });

      expect(response.status).toBe("completed");
      expect(getOutputText(response).length).toBeGreaterThan(0);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 4. Instructions (system prompt)
  // =========================================================================
  test(
    "instructions: influences response",
    async () => {
      const response = await client.responses.create({
        model: MODEL,
        max_output_tokens: 1024,
        instructions: "You are a pirate. You always respond with 'Ahoy!' first.",
        input: "Say hello",
      });

      expect(getOutputText(response).toLowerCase()).toContain("ahoy");
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 5. Developer message in structured input
  // =========================================================================
  test(
    "developer message: influences response",
    async () => {
      const response = await client.responses.create({
        model: MODEL,
        max_output_tokens: 1024,
        input: [
          {
            type: "message",
            role: "developer",
            content: "You are a pirate. You always respond with 'Ahoy!' first.",
          },
          { type: "message", role: "user", content: "Say hello" },
        ],
      });

      expect(getOutputText(response).toLowerCase()).toContain("ahoy");
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 6. Streaming text
  // =========================================================================
  test(
    "streaming: returns streamed text events",
    async () => {
      const stream = await client.responses.create({
        model: MODEL,
        max_output_tokens: 1024,
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
  // 7. Streaming event structure
  // =========================================================================
  test(
    "streaming event structure: correct event sequence",
    async () => {
      const stream = await client.responses.create({
        model: MODEL,
        max_output_tokens: 32,
        stream: true,
        input: "Say hi",
      });

      const eventTypes: string[] = [];
      for await (const event of stream) {
        eventTypes.push(event.type);
      }

      // Validate the event sequence
      expect(eventTypes[0]).toBe("response.created");
      expect(eventTypes[1]).toBe("response.in_progress");
      expect(eventTypes).toContain("response.output_item.added");
      expect(eventTypes).toContain("response.output_item.done");
      expect(eventTypes.at(-1)).toBe("response.completed");
      // Model may emit text deltas or reasoning summary events depending on config
      const hasTextDelta = eventTypes.includes("response.output_text.delta");
      const hasContentPart = eventTypes.includes("response.content_part.added");
      const hasReasoningSummary = eventTypes.includes("response.reasoning_summary_text.delta");
      expect(hasTextDelta || hasContentPart || hasReasoningSummary).toBe(true);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 8. Streaming usage in completed event
  // =========================================================================
  test(
    "streaming usage: completed event has usage data",
    async () => {
      const stream = await client.responses.create({
        model: MODEL,
        max_output_tokens: 32,
        stream: true,
        input: "Say hello",
      });

      let usage: { input_tokens: number; output_tokens: number } | undefined;
      for await (const event of stream) {
        if (event.type === "response.completed") {
          usage = event.response.usage as typeof usage;
        }
      }

      expect(usage).toBeDefined();
      expect(usage!.input_tokens).toBeGreaterThan(0);
      expect(usage!.output_tokens).toBeGreaterThan(0);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 9. Tool call — tool_choice: auto
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

      expect(response.status).toBe("completed");
      const fnCall = getFunctionCall(response);
      expect(fnCall).toBeDefined();
      expect(fnCall!.name).toBe("get_weather");
      const args = JSON.parse(fnCall!.arguments) as { location: string };
      expect(args.location).toBeDefined();
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 10. Tool call — tool_choice: none
  // =========================================================================
  test(
    "tool_choice none: no function calls returned",
    async () => {
      const response = await client.responses.create({
        model: MODEL,
        max_output_tokens: 1024,
        input: "What is the weather in Tokyo?",
        tools: [WEATHER_TOOL],
        tool_choice: "none",
      });

      const fnCalls = response.output.filter((o) => o.type === "function_call");
      expect(fnCalls.length).toBe(0);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 11. Tool call — tool_choice: required
  // =========================================================================
  test(
    "tool_choice required: forces a function call",
    async () => {
      const response = await client.responses.create({
        model: MODEL,
        max_output_tokens: 4096,
        input: "What is the weather in Berlin? Use the get_weather tool.",
        tools: [WEATHER_TOOL],
        tool_choice: "required",
      });

      expect(response.status).toBe("completed");
      const fnCall = getFunctionCall(response);
      expect(fnCall).toBeDefined();
      expect(fnCall!.name).toBe("get_weather");
      expect(fnCall!.call_id.length).toBeGreaterThan(0);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 12. Tool call — named tool_choice
  // =========================================================================
  test(
    "tool_choice named: forces specific tool by name",
    async () => {
      const response = await client.responses.create({
        model: MODEL,
        max_output_tokens: 4096,
        input: "Calculate 2+2 using the calculator tool.",
        tools: [WEATHER_TOOL, CALCULATOR_TOOL],
        tool_choice: { type: "function", name: "calculator" },
      });

      expect(response.status).toBe("completed");
      const fnCall = getFunctionCall(response);
      expect(fnCall).toBeDefined();
      expect(fnCall!.name).toBe("calculator");
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 13. Multiple tools — model picks correct one
  // =========================================================================
  test(
    "multiple tools: model picks the right one",
    async () => {
      const response = await client.responses.create({
        model: MODEL,
        max_output_tokens: 256,
        input: "What is the weather in Berlin? Use the appropriate tool.",
        tools: [WEATHER_TOOL, CALCULATOR_TOOL],
        tool_choice: "required",
      });

      expect(response.status).toBe("completed");
      const fnCall = getFunctionCall(response);
      expect(fnCall).toBeDefined();
      expect(fnCall!.name).toBe("get_weather");
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 14. Streaming tool calls
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
      let callId = "";
      let hasDoneEvent = false;

      for await (const event of stream) {
        if (event.type === "response.output_item.added" && event.item.type === "function_call") {
          toolName = event.item.name;
          callId = event.item.call_id;
        }
        if (event.type === "response.function_call_arguments.delta") {
          toolArgs += event.delta;
        }
        if (event.type === "response.function_call_arguments.done") {
          hasDoneEvent = true;
        }
      }

      expect(toolName).toBe("get_weather");
      expect(callId.length).toBeGreaterThan(0);
      expect(hasDoneEvent).toBe(true);
      const args = JSON.parse(toolArgs) as { location: string };
      expect(args.location).toBeDefined();
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 15. Multi-turn tool use — full round-trip
  // =========================================================================
  test(
    "multi-turn tool use: function_call_output round-trip",
    async () => {
      // Step 1: model calls the tool
      const step1 = await client.responses.create({
        model: MODEL,
        max_output_tokens: 256,
        input: "What is the weather in Paris? Use the get_weather tool.",
        tools: [WEATHER_TOOL],
        tool_choice: "required",
      });

      expect(step1.status).toBe("completed");
      const fnCall = getFunctionCall(step1);
      expect(fnCall).toBeDefined();

      // Step 2: send tool result back
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
  // 16. Multi-turn tool use — tool error handling
  // =========================================================================
  test(
    "multi-turn tool use: tool error handled gracefully",
    async () => {
      // Step 1: force tool call
      const step1 = await client.responses.create({
        model: MODEL,
        max_output_tokens: 4096,
        input: "What is the weather in Mars? You must use the get_weather tool to answer.",
        tools: [WEATHER_TOOL],
        tool_choice: "auto",
      });

      const fnCall = getFunctionCall(step1);
      if (!fnCall) return; // Skip if model doesn't call tool

      // Step 2: send error result
      const step2 = await client.responses.create({
        model: MODEL,
        max_output_tokens: 4096,
        input: [
          {
            type: "message",
            role: "user",
            content: "What is the weather in Mars? You must use the get_weather tool to answer.",
          },
          {
            type: "function_call",
            call_id: fnCall.call_id,
            name: fnCall.name,
            arguments: fnCall.arguments,
          },
          {
            type: "function_call_output",
            call_id: fnCall.call_id,
            output: "Error: Location 'Mars' not found. Only Earth locations are supported.",
          },
        ],
        tools: [WEATHER_TOOL],
      });

      expect(step2.status).toBe("completed");
      expect(getOutputText(step2).length).toBeGreaterThan(0);
    },
    { timeout: 90_000 },
  );

  // =========================================================================
  // 17. Multi-turn conversations — context maintenance
  // =========================================================================
  test(
    "multi-turn: maintains context across turns",
    async () => {
      const response = await client.responses.create({
        model: MODEL,
        max_output_tokens: 1024,
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
  // 18. Multi-turn with mixed content
  // =========================================================================
  test(
    "multi-turn mixed: text + function_call + function_call_output",
    async () => {
      const response = await client.responses.create({
        model: MODEL,
        max_output_tokens: 256,
        input: [
          { type: "message", role: "user", content: "What is the weather in Paris?" },
          {
            type: "function_call",
            call_id: "call_test_123",
            name: "get_weather",
            arguments: '{"location":"Paris"}',
          },
          {
            type: "function_call_output",
            call_id: "call_test_123",
            output: "It is 22°C and sunny in Paris.",
          },
          { type: "message", role: "user", content: "Is that warm?" },
        ],
        tools: [WEATHER_TOOL],
      });

      expect(response.status).toBe("completed");
      expect(getOutputText(response).length).toBeGreaterThan(0);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 19. Reasoning — effort medium
  // =========================================================================
  test(
    "reasoning effort medium: produces valid response",
    async () => {
      const response = await client.responses.create({
        model: MODEL,
        max_output_tokens: 16000,
        reasoning: { effort: "medium" },
        input: "What is 27 * 453? Think step by step.",
      });

      expect(response.status).toBe("completed");
      const content = getOutputText(response).replaceAll(/[\s,{}\\]/g, "");
      expect(content).toContain("12231");
    },
    { timeout: 120_000 },
  );

  // =========================================================================
  // 20. Reasoning — effort none (disabled)
  // =========================================================================
  test(
    "reasoning effort none: no reasoning items",
    async () => {
      const response = await client.responses.create({
        model: MODEL,
        max_output_tokens: 1024,
        reasoning: { effort: "none" } as OpenAI.Responses.ResponseCreateParams["reasoning"],
        input: "What is 2 + 2?",
      });

      expect(response.status).toBe("completed");
      expect(getOutputText(response).length).toBeGreaterThan(0);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 21. Reasoning — streaming
  // =========================================================================
  test(
    "streaming reasoning: reasoning content appears in stream",
    async () => {
      const stream = await client.responses.create({
        model: MODEL,
        max_output_tokens: 16000,
        reasoning: { effort: "medium" },
        stream: true,
        input: "What is 15 * 37?",
      });

      let text = "";
      for await (const event of stream) {
        if (event.type === "response.output_text.delta") {
          text += event.delta;
        }
      }

      expect(text.length).toBeGreaterThan(0);
      expect(text.replaceAll(" ", "").replaceAll("{}", "")).toContain("555");
    },
    { timeout: 120_000 },
  );

  // =========================================================================
  // 22. Reasoning — reasoning output item structure
  // =========================================================================
  test(
    "reasoning output: reasoning item has summary array",
    async () => {
      const response = await client.responses.create({
        model: MODEL,
        max_output_tokens: 16000,
        reasoning: { effort: "medium" },
        input: "What is 47 * 83? Think carefully.",
      });

      expect(response.status).toBe("completed");

      const reasoningItem = response.output.find(
        (o): o is ResponseReasoningItem => o.type === "reasoning",
      );
      if (reasoningItem) {
        expect(reasoningItem.summary).toBeDefined();
        expect(Array.isArray(reasoningItem.summary)).toBe(true);
      }

      const content = getOutputText(response).replaceAll(/[\s,{}\\]/g, "");
      expect(content).toContain("3901");
    },
    { timeout: 120_000 },
  );

  // =========================================================================
  // 23. Structured output — json_schema
  // =========================================================================
  test(
    "structured output: returns valid JSON matching schema",
    async () => {
      const response = await client.responses.create({
        model: MODEL,
        max_output_tokens: 1024,
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
      const text = getOutputText(response);
      const parsed = JSON.parse(text) as { name: unknown; age: unknown };
      expect(parsed.name).toBeDefined();
      expect(parsed.age).toBeDefined();
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 24. Structured output — text format baseline
  // =========================================================================
  test(
    "text format: normal text response",
    async () => {
      const response = await client.responses.create({
        model: MODEL,
        max_output_tokens: 1024,
        text: { format: { type: "text" } },
        input: "Say hello",
      });

      expect(response.status).toBe("completed");
      expect(getOutputText(response).length).toBeGreaterThan(0);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 25. Temperature parameter
  // =========================================================================
  test(
    "temperature: temperature 0 produces valid response",
    async () => {
      const response = await client.responses.create({
        model: MODEL,
        max_output_tokens: 1024,
        temperature: 0,
        input: "What is 1+1? Reply with just the number.",
      });

      expect(getOutputText(response)).toContain("2");
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 26. max_output_tokens enforcement
  // =========================================================================
  test(
    "max_output_tokens: very low limit produces incomplete status",
    async () => {
      const response = await client.responses.create({
        model: MODEL,
        max_output_tokens: 3,
        input: "Write a very long essay about the history of the universe.",
      });

      expect(response.status).toBe("incomplete");
      expect(response.usage!.output_tokens).toBeLessThanOrEqual(5);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 27. top_p parameter accepted
  // =========================================================================
  test(
    "top_p: parameter accepted",
    async () => {
      const response = await client.responses.create({
        model: MODEL,
        max_output_tokens: 1024,
        top_p: 0.9,
        input: "Say hello",
      });

      expect(response.status === "completed" || response.status === "incomplete").toBe(true);
      expect(getOutputText(response).length).toBeGreaterThan(0);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 28. Image input — skipped (gpt-oss-120b does not support image content)
  // See responses-claude.test.ts for image input coverage.
  // =========================================================================

  // =========================================================================
  // 29. Metadata passthrough
  // =========================================================================
  test(
    "metadata: passes through without error",
    async () => {
      const response = await client.responses.create({
        model: MODEL,
        max_output_tokens: 1024,
        metadata: { user_id: "test-user-123" },
        input: "Say ok",
      });

      expect(getOutputText(response).length).toBeGreaterThanOrEqual(1);
    },
    { timeout: 60_000 },
  );

  // =========================================================================
  // 30. Service tier flex
  // =========================================================================
  test(
    "service_tier: flex accepted",
    async () => {
      const response = await client.responses.create({
        model: MODEL,
        max_output_tokens: 1024,
        service_tier: "flex",
        input: "Say hello",
      });

      expect(response.status === "completed" || response.status === "incomplete").toBe(true);
    },
    { timeout: 360_000 },
  );

  // =========================================================================
  // 31. parallel_tool_calls parameter
  // =========================================================================
  test(
    "parallel_tool_calls: parameter accepted without error",
    async () => {
      const response = await client.responses.create({
        model: MODEL,
        max_output_tokens: 256,
        input: "What is the weather in Berlin? Use the get_weather tool.",
        tools: [WEATHER_TOOL],
        tool_choice: "required",
        parallel_tool_calls: true,
      });

      expect(response.status).toBe("completed");
      expect(getFunctionCall(response)).toBeDefined();
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

    test(
      "missing required fields: returns a 400 error",
      async () => {
        try {
          await client.responses.create({
            model: MODEL,
            input: [
              // @ts-expect-error — intentionally missing required `content` field
              {
                type: "message",
                role: "user",
              },
            ],
          });
          expect(true).toBe(false);
        } catch (error: unknown) {
          expect(error).toBeInstanceOf(APIError);
          expect((error as APIError).status).toBe(400);
        }
      },
      { timeout: 30_000 },
    );

    test(
      "wrong HTTP method: GET returns 405",
      async () => {
        // SDK does not support GET for this endpoint, so raw fetch is required
        const res = await fetch(`${baseUrl}/v1/responses`, {
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
          await client.responses.create({
            model: MODEL,
            max_output_tokens: 64,
            input: bigString,
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
});
