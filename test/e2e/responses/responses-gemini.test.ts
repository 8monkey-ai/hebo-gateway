import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import OpenAI, { APIError } from "openai";
import type { ResponseFunctionToolCall } from "openai/resources/responses/responses";

import { gemini3FlashPreview } from "../../../src/models/google";
import { GOOGLE_VERTEX_API_KEY, GOOGLE_VERTEX_PROJECT } from "../shared/env";
import { getOutputText } from "../shared/responses-helpers";
import { createVertexTestServer, type TestServer } from "../shared/server";
import { RESPONSE_WEATHER_TOOL as WEATHER_TOOL } from "../shared/tools";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const hasVertexCredentials = !!(GOOGLE_VERTEX_API_KEY && GOOGLE_VERTEX_PROJECT);
const VERTEX_MODEL = "google/gemini-3-flash-preview";

// ---------------------------------------------------------------------------
// Gateway + Server setup
// ---------------------------------------------------------------------------

let testServer: TestServer;
let client: OpenAI;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!hasVertexCredentials)("Responses E2E (Vertex - thought_signature)", () => {
  beforeAll(() => {
    testServer = createVertexTestServer(gemini3FlashPreview());
    client = new OpenAI({
      apiKey: "not-needed",
      baseURL: `${testServer.baseUrl}/v1`,
    });
  });

  afterAll(async () => {
    await testServer?.server?.stop(true);
  });

  // =========================================================================
  // thought_signature pass: full multi-turn roundtrip with extra_content
  // =========================================================================
  test(
    "thought_signature: extra_content is present on function_call and echoed back correctly",
    async () => {
      // Turn 1: ask something that requires a tool call, with reasoning enabled
      const turn1 = (await client.responses.create({
        model: VERTEX_MODEL,
        max_output_tokens: 1024,
        input: "What's the weather in Berlin?",
        tools: [WEATHER_TOOL],
        // Enable reasoning so Gemini attaches thought_signature
        // @ts-expect-error — gateway extension
        reasoning: { enabled: true, max_tokens: 2048 },
      })) as OpenAI.Responses.Response & {
        output: (OpenAI.Responses.ResponseOutputItem & {
          extra_content?: Record<string, Record<string, unknown>>;
        })[];
      };

      expect(turn1.status).toBe("completed");

      const fnCall = turn1.output.find((o) => o.type === "function_call") as
        | (ResponseFunctionToolCall & {
            extra_content?: Record<string, Record<string, unknown>>;
          })
        | undefined;
      expect(fnCall).toBeDefined();

      // Gemini 3 attaches thought_signature to function_call items via extra_content
      expect(fnCall?.extra_content).toBeDefined();
      expect(fnCall?.extra_content?.["vertex"]?.["thought_signature"]).toBeDefined();

      // Turn 2: send back the function_call WITH extra_content so the model can
      // verify its chain-of-thought, then provide the tool result
      const turn2 = (await client.responses.create({
        model: VERTEX_MODEL,
        max_output_tokens: 256,
        input: [
          { type: "message", role: "user", content: "What's the weather in Berlin?" },
          {
            type: "function_call",
            call_id: fnCall!.call_id,
            name: fnCall!.name,
            arguments: fnCall!.arguments,
            // @ts-expect-error — gateway extension
            extra_content: fnCall!.extra_content,
          },
          {
            type: "function_call_output",
            call_id: fnCall!.call_id,
            output: "Berlin: 18°C, partly cloudy",
          },
        ],
        tools: [{ ...WEATHER_TOOL }],
        // @ts-expect-error — gateway extension
        reasoning: { enabled: true, max_tokens: 2048 },
      })) as OpenAI.Responses.Response;

      expect(turn2.status).toBe("completed");
      expect(getOutputText(turn2).toLowerCase()).toContain("berlin");
    },
    { timeout: 120_000 },
  );

  // =========================================================================
  // thought_signature fail: corrupted thought_signature causes provider error
  // =========================================================================
  test(
    "thought_signature: invalid thought_signature returns provider error",
    async () => {
      // Turn 1: get a real tool call response with extra_content
      const turn1 = (await client.responses.create({
        model: VERTEX_MODEL,
        max_output_tokens: 1024,
        input: "What's the weather in Paris?",
        tools: [WEATHER_TOOL],
        // @ts-expect-error — gateway extension
        reasoning: { enabled: true, max_tokens: 2048 },
      })) as OpenAI.Responses.Response & {
        output: (OpenAI.Responses.ResponseOutputItem & {
          extra_content?: Record<string, Record<string, unknown>>;
        })[];
      };

      expect(turn1.status).toBe("completed");
      const fnCall = turn1.output.find((o) => o.type === "function_call") as
        | (ResponseFunctionToolCall & {
            extra_content?: Record<string, Record<string, unknown>>;
          })
        | undefined;
      expect(fnCall).toBeDefined();

      // Turn 2: send back function_call with corrupted thought_signature
      try {
        await client.responses.create({
          model: VERTEX_MODEL,
          max_output_tokens: 256,
          input: [
            { type: "message", role: "user", content: "What's the weather in Paris?" },
            {
              type: "function_call",
              call_id: fnCall!.call_id,
              name: fnCall!.name,
              arguments: fnCall!.arguments,
              // @ts-expect-error — gateway extension
              extra_content: { vertex: { thought_signature: "invalid-corrupted-signature" } },
            },
            {
              type: "function_call_output",
              call_id: fnCall!.call_id,
              output: "Paris: 22°C, sunny",
            },
          ],
          tools: [{ ...WEATHER_TOOL }],
          // @ts-expect-error — gateway extension
          reasoning: { enabled: true, max_tokens: 2048 },
        });
        expect(true).toBe(false);
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(APIError);
        expect((error as APIError).status).toBeGreaterThanOrEqual(400);
      }
    },
    { timeout: 120_000 },
  );

  // =========================================================================
  // thought_signature round-trip via streaming
  // =========================================================================
  test(
    "thought_signature streaming: extra_content preserved in streaming events",
    async () => {
      const stream = await client.responses.create({
        model: VERTEX_MODEL,
        max_output_tokens: 1024,
        stream: true,
        input: "What's the weather in Tokyo?",
        tools: [WEATHER_TOOL],
        // @ts-expect-error — gateway extension
        reasoning: { enabled: true, max_tokens: 2048 },
      });

      let fnCallItem:
        | (ResponseFunctionToolCall & {
            extra_content?: Record<string, Record<string, unknown>>;
          })
        | undefined;
      let hasCompletedEvent = false;

      for await (const event of stream) {
        if (event.type === "response.output_item.added" && event.item.type === "function_call") {
          fnCallItem = event.item as typeof fnCallItem;
        }
        if (event.type === "response.completed") {
          hasCompletedEvent = true;
        }
      }

      expect(hasCompletedEvent).toBe(true);

      // If a function call was emitted, check for extra_content
      if (fnCallItem) {
        expect(fnCallItem.extra_content).toBeDefined();
        expect(fnCallItem.extra_content?.["vertex"]?.["thought_signature"]).toBeDefined();
      }
    },
    { timeout: 120_000 },
  );
});
