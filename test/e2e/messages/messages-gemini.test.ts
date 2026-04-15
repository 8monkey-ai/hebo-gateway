import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { createVertex } from "@ai-sdk/google-vertex";
import Anthropic, { APIError } from "@anthropic-ai/sdk";

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

// ---------------------------------------------------------------------------
// Gateway + Server setup
// ---------------------------------------------------------------------------

let server: ReturnType<typeof Bun.serve>;
let client: Anthropic;

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

  client = new Anthropic({
    apiKey: "not-needed",
    baseURL: `http://localhost:${server.port}`,
  });
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!hasVertexCredentials)("Messages E2E (Vertex - thought_signature)", () => {
  beforeAll(() => {
    startServer();
  });

  afterAll(async () => {
    await server.stop(true);
  });

  // =========================================================================
  // thought_signature pass: full multi-turn roundtrip with extra_content
  // =========================================================================
  test(
    "thought_signature: extra_content is present on tool_use and echoed back correctly",
    async () => {
      // Turn 1: ask something that requires a tool call
      const turn1 = await client.messages.create({
        model: VERTEX_MODEL,
        max_tokens: 1024,
        thinking: { type: "enabled", budget_tokens: 2048 },
        tools: [WEATHER_TOOL],
        messages: [{ role: "user", content: "What's the weather in Berlin?" }],
      });

      expect(turn1.stop_reason).toBe("tool_use");

      const toolUseBlock = turn1.content.find((b) => b.type === "tool_use") as
        | (Anthropic.Messages.ToolUseBlock & {
            extra_content?: Record<string, Record<string, unknown>>;
          })
        | undefined;
      expect(toolUseBlock).toBeDefined();
      // Gemini 3 attaches thought_signature to tool_use blocks via extra_content
      expect(toolUseBlock?.extra_content).toBeDefined();
      expect(toolUseBlock?.extra_content?.["vertex"]?.["thought_signature"]).toBeDefined();

      // Turn 2: send back the tool_use block WITH extra_content so the model can
      // verify its chain-of-thought, then provide the tool result
      const assistantMsg: Anthropic.Messages.MessageParam = {
        role: "assistant",
        content: turn1.content,
      };
      const toolResultMsg: Anthropic.Messages.MessageParam = {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUseBlock!.id,
            content: "Berlin: 18°C, partly cloudy",
          },
        ],
      };

      const turn2 = await client.messages.create({
        model: VERTEX_MODEL,
        max_tokens: 256,
        thinking: { type: "enabled", budget_tokens: 2048 },
        tools: [WEATHER_TOOL],
        messages: [
          { role: "user", content: "What's the weather in Berlin?" },
          assistantMsg,
          toolResultMsg,
        ],
      });

      expect(turn2.stop_reason).toBe("end_turn");
      const textBlock = turn2.content.find((b) => b.type === "text");
      expect((textBlock as { text?: string } | undefined)?.text?.toLowerCase()).toContain("berlin");
    },
    { timeout: 120_000 },
  );

  // =========================================================================
  // thought_signature fail: corrupted thought_signature causes provider error
  // =========================================================================
  test(
    "thought_signature: invalid thought_signature in extra_content returns provider error",
    async () => {
      // Turn 1: get a real tool_use response with extra_content
      const turn1 = await client.messages.create({
        model: VERTEX_MODEL,
        max_tokens: 1024,
        thinking: { type: "enabled", budget_tokens: 2048 },
        tools: [WEATHER_TOOL],
        messages: [{ role: "user", content: "What's the weather in Paris?" }],
      });

      expect(turn1.stop_reason).toBe("tool_use");
      const toolUseBlock = turn1.content.find((b) => b.type === "tool_use") as
        | (Anthropic.Messages.ToolUseBlock & {
            extra_content?: Record<string, Record<string, unknown>>;
          })
        | undefined;
      expect(toolUseBlock).toBeDefined();

      // Turn 2: send back tool_use with a deliberately corrupted thought_signature
      const corruptedToolUse = {
        type: "tool_use" as const,
        id: toolUseBlock!.id,
        name: toolUseBlock!.name,
        input: toolUseBlock!.input,
        extra_content: { vertex: { thought_signature: "invalid-corrupted-signature" } },
      };
      const assistantMsg: Anthropic.Messages.MessageParam = {
        role: "assistant",
        content: [corruptedToolUse] as unknown as Anthropic.Messages.ContentBlock[],
      };
      const toolResultMsg: Anthropic.Messages.MessageParam = {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUseBlock!.id,
            content: "Paris: 22°C, sunny",
          },
        ],
      };

      try {
        await client.messages.create({
          model: VERTEX_MODEL,
          max_tokens: 256,
          thinking: { type: "enabled", budget_tokens: 2048 },
          tools: [WEATHER_TOOL],
          messages: [
            { role: "user", content: "What's the weather in Paris?" },
            assistantMsg,
            toolResultMsg,
          ],
        });
        expect(true).toBe(false); // should have thrown
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(APIError);
        expect((error as APIError).status).toBeGreaterThanOrEqual(400);
      }
    },
    { timeout: 120_000 },
  );
});
