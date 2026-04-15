import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { createVertex } from "@ai-sdk/google-vertex";
import OpenAI, { APIError } from "openai";
import type {
  FunctionTool,
  ResponseFunctionToolCall,
  ResponseOutputMessage,
  ResponseOutputText,
} from "openai/resources/responses/responses";

import { defineModelCatalog, gateway } from "../../../src";
import { gemini3FlashPreview } from "../../../src/models/google";
import { withCanonicalIdsForVertex } from "../../../src/providers/vertex";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const GOOGLE_VERTEX_API_KEY = process.env["GOOGLE_VERTEX_API_KEY"];
const GOOGLE_VERTEX_PROJECT = process.env["GOOGLE_VERTEX_PROJECT"];
const GOOGLE_VERTEX_LOCATION = process.env["GOOGLE_VERTEX_LOCATION"] ?? "us-central1";
const hasVertexCredentials = !!(GOOGLE_VERTEX_API_KEY && GOOGLE_VERTEX_PROJECT);
const VERTEX_MODEL = "google/gemini-3-flash-preview";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getOutputText(response: OpenAI.Responses.Response): string {
  const msg = response.output.find(
    (o): o is ResponseOutputMessage => o.type === "message",
  );
  const part = msg?.content.find(
    (c): c is ResponseOutputText => c.type === "output_text",
  );
  return part?.text ?? "";
}


// ---------------------------------------------------------------------------
// Shared tool definitions (Responses API format)
// ---------------------------------------------------------------------------

const WEATHER_TOOL: FunctionTool = {
  type: "function",
  name: "get_weather",
  description: "Get the current weather for a given location.",
  strict: false,
  parameters: {
    type: "object",
    properties: {
      location: { type: "string", description: "City and state" },
    },
    required: ["location"],
  },
};

// ---------------------------------------------------------------------------
// Gateway + Server setup
// ---------------------------------------------------------------------------

let server: ReturnType<typeof Bun.serve>;
let client: OpenAI;
let baseUrl: string;

const startServer = () => {
  const vertex = createVertex({
    apiKey: GOOGLE_VERTEX_API_KEY!,
    project: GOOGLE_VERTEX_PROJECT!,
    location: GOOGLE_VERTEX_LOCATION,
  });

  const gw = gateway({
    basePath: "/v1",
    logger: { level: "warn" },
    providers: {
      vertex: withCanonicalIdsForVertex(vertex),
    },
    models: defineModelCatalog(gemini3FlashPreview()),
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
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!hasVertexCredentials)("Responses E2E (Vertex - thought_signature)", () => {
  beforeAll(() => {
    startServer();
  });

  afterAll(async () => {
    await server?.stop(true);
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
      // @ts-expect-error — gateway extensions (extra_content, reasoning)
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
            extra_content: fnCall!.extra_content,
          },
          {
            type: "function_call_output",
            call_id: fnCall!.call_id,
            output: "Berlin: 18°C, partly cloudy",
          },
        ],
        tools: [{ ...WEATHER_TOOL }],
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
        // @ts-expect-error — gateway extensions (extra_content, reasoning)
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
              extra_content: { vertex: { thought_signature: "invalid-corrupted-signature" } },
            },
            {
              type: "function_call_output",
              call_id: fnCall!.call_id,
              output: "Paris: 22°C, sunny",
            },
          ],
          tools: [{ ...WEATHER_TOOL }],
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
