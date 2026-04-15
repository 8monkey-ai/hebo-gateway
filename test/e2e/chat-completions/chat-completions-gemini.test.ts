import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import OpenAI, { APIError } from "openai";
import type { ChatCompletionMessageFunctionToolCall } from "openai/resources/chat/completions";

import { gemini3FlashPreview } from "../../../src/models/google";
import { GOOGLE_VERTEX_API_KEY, GOOGLE_VERTEX_PROJECT } from "../shared/server";
import { createVertexTestServer, type TestServer } from "../shared/server";
import { CHAT_WEATHER_TOOL as WEATHER_TOOL } from "../shared/tools";

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
let baseUrl: string;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!hasVertexCredentials)("Chat Completions E2E (Vertex - thought_signature)", () => {
  beforeAll(() => {
    testServer = createVertexTestServer(gemini3FlashPreview());
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
  // thought_signature pass: full multi-turn roundtrip with extra_body
  // =========================================================================
  test(
    "thought_signature: extra_body is present on tool_calls and echoed back correctly",
    async () => {
      // Turn 1: ask something that requires a tool call, with reasoning enabled
      const turn1 = (await client.chat.completions.create({
        model: VERTEX_MODEL,
        max_completion_tokens: 1024,
        messages: [{ role: "user", content: "What's the weather in Berlin?" }],
        tools: [WEATHER_TOOL],
        // Enable reasoning so Gemini attaches thought_signature
        // @ts-expect-error — gateway extension
        reasoning: { enabled: true, max_tokens: 2048 },
      })) as OpenAI.Chat.Completions.ChatCompletion & {
        choices: {
          message: {
            tool_calls?: (OpenAI.Chat.Completions.ChatCompletionMessageToolCall & {
              extra_content?: Record<string, Record<string, unknown>>;
            })[];
            extra_content?: Record<string, Record<string, unknown>>;
          };
        }[];
      };

      expect(turn1.choices[0]!.finish_reason).toBe("tool_calls");

      const toolCall = turn1.choices[0]!.message.tool_calls?.[0];
      expect(toolCall).toBeDefined();

      // Gemini 3 attaches thought_signature to tool calls via extra_content
      expect(toolCall?.extra_content).toBeDefined();
      expect(toolCall?.extra_content?.["vertex"]?.["thought_signature"]).toBeDefined();

      // Turn 2: send back the tool call WITH extra_content so the model can
      // verify its chain-of-thought, then provide the tool result
      const assistantMsg = {
        role: "assistant" as const,
        tool_calls: turn1.choices[0]!.message.tool_calls,
        // Pass through extra_content via extra_body
        extra_content: turn1.choices[0]!.message.extra_content,
      };

      const turn2 = await client.chat.completions.create({
        model: VERTEX_MODEL,
        max_completion_tokens: 256,
        messages: [
          { role: "user", content: "What's the weather in Berlin?" },
          assistantMsg as unknown as OpenAI.Chat.Completions.ChatCompletionMessageParam,
          {
            role: "tool",
            tool_call_id: toolCall!.id,
            content: "Berlin: 18°C, partly cloudy",
          },
        ],
        tools: [WEATHER_TOOL],
        // @ts-expect-error — gateway extension
        reasoning: { enabled: true, max_tokens: 2048 },
      });

      expect(turn2.choices[0]!.finish_reason).toBe("stop");
      expect(turn2.choices[0]!.message.content!.toLowerCase()).toContain("berlin");
    },
    { timeout: 120_000 },
  );

  // =========================================================================
  // thought_signature fail: corrupted thought_signature causes provider error
  // =========================================================================
  test(
    "thought_signature: invalid thought_signature returns provider error",
    async () => {
      // Turn 1: get a real tool_use response
      const turn1 = (await client.chat.completions.create({
        model: VERTEX_MODEL,
        max_completion_tokens: 1024,
        messages: [{ role: "user", content: "What's the weather in Paris?" }],
        tools: [WEATHER_TOOL],
        // @ts-expect-error — gateway extension
        reasoning: { enabled: true, max_tokens: 2048 },
      })) as OpenAI.Chat.Completions.ChatCompletion & {
        choices: {
          message: {
            tool_calls?: (OpenAI.Chat.Completions.ChatCompletionMessageToolCall & {
              extra_content?: Record<string, Record<string, unknown>>;
            })[];
          };
        }[];
      };

      expect(turn1.choices[0]!.finish_reason).toBe("tool_calls");
      const toolCall = turn1.choices[0]!.message
        .tool_calls?.[0] as ChatCompletionMessageFunctionToolCall & {
        extra_content?: Record<string, Record<string, unknown>>;
      };
      expect(toolCall).toBeDefined();

      // Turn 2: send back tool call with corrupted thought_signature
      const corruptedAssistantMsg = {
        role: "assistant" as const,
        tool_calls: [
          {
            id: toolCall.id,
            type: "function" as const,
            function: toolCall.function,
            extra_content: { vertex: { thought_signature: "invalid-corrupted-signature" } },
          },
        ],
      };

      try {
        await client.chat.completions.create({
          model: VERTEX_MODEL,
          max_completion_tokens: 256,
          messages: [
            { role: "user", content: "What's the weather in Paris?" },
            corruptedAssistantMsg as unknown as OpenAI.Chat.Completions.ChatCompletionMessageParam,
            {
              role: "tool",
              tool_call_id: toolCall.id,
              content: "Paris: 22°C, sunny",
            },
          ],
          tools: [WEATHER_TOOL],
          // @ts-expect-error — gateway extension
          reasoning: { enabled: true, max_tokens: 2048 },
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
