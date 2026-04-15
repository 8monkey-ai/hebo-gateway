import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import Anthropic, { APIError } from "@anthropic-ai/sdk";

import { gemini3FlashPreview } from "../../../src/models/google";
import {
  createVertexTestServer,
  GOOGLE_VERTEX_API_KEY,
  GOOGLE_VERTEX_PROJECT,
  type TestServer,
} from "../shared/server";
import { MESSAGE_WEATHER_TOOL as WEATHER_TOOL } from "../shared/tools";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const hasVertexCredentials = !!(GOOGLE_VERTEX_API_KEY && GOOGLE_VERTEX_PROJECT);
const VERTEX_MODEL = "google/gemini-3-flash-preview";

// ---------------------------------------------------------------------------
// Gateway + Server setup
// ---------------------------------------------------------------------------

let testServer: TestServer;
let client: Anthropic;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!hasVertexCredentials)("Messages E2E (Vertex - thought_signature)", () => {
  beforeAll(() => {
    testServer = createVertexTestServer(gemini3FlashPreview());
    client = new Anthropic({
      apiKey: "not-needed",
      baseURL: testServer.baseUrl,
    });
  });

  afterAll(async () => {
    await testServer?.server?.stop(true);
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
