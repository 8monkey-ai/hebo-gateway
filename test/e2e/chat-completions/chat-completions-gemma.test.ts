import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import OpenAI from "openai";

import { gemma426bA4b } from "../../../src/models/google";
import { GOOGLE_VERTEX_PROJECT } from "../shared/server";
import { createVertexTestServer, type TestServer } from "../shared/server";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

// Vertex MaaS requires OAuth (ADC / service account); express API keys are
// rejected by the endpoint. Requires `gcloud auth application-default login`
// or GOOGLE_APPLICATION_CREDENTIALS in addition to GOOGLE_VERTEX_PROJECT.
const hasVertexCredentials = !!GOOGLE_VERTEX_PROJECT;
const VERTEX_MODEL = "google/gemma-4-26b-a4b";

// ---------------------------------------------------------------------------
// Gateway + Server setup
// ---------------------------------------------------------------------------

let testServer: TestServer;
let client: OpenAI;
let baseUrl: string;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!hasVertexCredentials)(
  "Chat Completions E2E (Vertex MaaS - Gemma 4 26B-A4B)",
  () => {
    beforeAll(() => {
      testServer = createVertexTestServer(gemma426bA4b());
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
    // reasoning enabled: thinking returned separately from content
    // =========================================================================
    test(
      "reasoning enabled: returns reasoning separated from content",
      async () => {
        const completion = (await client.chat.completions.create({
          model: VERTEX_MODEL,
          max_completion_tokens: 2048,
          messages: [{ role: "user", content: "What is 17 * 23? Answer briefly." }],
          // @ts-expect-error — gateway extension
          reasoning: { enabled: true },
        })) as OpenAI.Chat.Completions.ChatCompletion & {
          choices: { message: { reasoning?: string } }[];
        };

        const message = completion.choices[0]!.message;
        expect(message.reasoning).toBeString();
        expect(message.reasoning!.length).toBeGreaterThan(0);
        expect(message.content!.replaceAll(",", "")).toContain("391");
      },
      { timeout: 120_000 },
    );

    // =========================================================================
    // streaming: reasoning deltas separate from content deltas
    // =========================================================================
    test(
      "streaming reasoning: reasoning deltas are separate from content deltas",
      async () => {
        const stream = await client.chat.completions.create({
          model: VERTEX_MODEL,
          max_completion_tokens: 2048,
          stream: true,
          reasoning_effort: "high",
          messages: [{ role: "user", content: "What is 15 * 37? Answer briefly." }],
        });

        let content = "";
        let reasoning = "";
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta as
            | (OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta & { reasoning?: string })
            | undefined;
          if (delta?.content) content += delta.content;
          if (delta?.reasoning) reasoning += delta.reasoning;
        }

        expect(reasoning.length).toBeGreaterThan(0);
        expect(content.replaceAll(",", "")).toContain("555");
      },
      { timeout: 120_000 },
    );

    // =========================================================================
    // reasoning disabled: no thinking tokens generated
    // =========================================================================
    test(
      "reasoning disabled: no reasoning in the response",
      async () => {
        const completion = (await client.chat.completions.create({
          model: VERTEX_MODEL,
          max_completion_tokens: 256,
          reasoning_effort:
            "none" as OpenAI.Chat.Completions.ChatCompletionCreateParams["reasoning_effort"],
          messages: [{ role: "user", content: "What is 2 + 2?" }],
        })) as OpenAI.Chat.Completions.ChatCompletion & {
          choices: { message: { reasoning?: string } }[];
        };

        const message = completion.choices[0]!.message;
        expect(message.reasoning).toBeUndefined();
        expect(message.content).toContain("4");
      },
      { timeout: 60_000 },
    );
  },
);
