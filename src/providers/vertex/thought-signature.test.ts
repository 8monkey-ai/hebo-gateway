import { expect, test } from "bun:test";

import { createVertex } from "@ai-sdk/google-vertex";

import { parseResponse, postJson } from "../../../test/helpers/http";
import { chatCompletions } from "../../endpoints/chat-completions/handler";
import type { ChatCompletions } from "../../endpoints/chat-completions/schema";
import { defineModelCatalog } from "../../models/catalog";
import { gemini36Flash } from "../../models/google/presets";
import { withCanonicalIdsForVertex } from "./canonical";

type GeminiRequest = { contents: { parts: { thoughtSignature?: string }[] }[] };

const requests: GeminiRequest[] = [];

const endpoint = chatCompletions({
  providers: {
    vertex: withCanonicalIdsForVertex(
      createVertex({
        apiKey: "test-key",
        project: "test-project",
        location: "global",
        // oxlint-disable-next-line require-await
        fetch: (async (_url: RequestInfo | URL, init?: RequestInit) => {
          requests.push(JSON.parse(init?.body as string) as GeminiRequest);
          return Response.json({
            candidates: [
              {
                content: {
                  role: "model",
                  parts: [
                    {
                      functionCall: { name: "get_weather", args: { city: "Paris" } },
                      thoughtSignature: "sig-from-gemini",
                    },
                  ],
                },
                finishReason: "STOP",
              },
            ],
            usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
          });
        }) as typeof fetch,
      }),
    ),
  },
  models: defineModelCatalog(gemini36Flash),
});

const send = async (messages: unknown[]) =>
  parseResponse<ChatCompletions>(
    await endpoint.handler(
      postJson("http://localhost/chat/completions", {
        model: "google/gemini-3.6-flash",
        tools: [{ type: "function", function: { name: "get_weather", parameters: {} } }],
        messages,
      }),
    ),
  );

test("a replayed Gemini tool call sends its thought signature back to Vertex", async () => {
  const user = { role: "user", content: "What is the weather in Paris?" };
  const first = await send([user]);
  const toolCall = first!.choices[0]!.message.tool_calls![0]!;

  await send([
    user,
    { role: "assistant", content: null, tool_calls: [toolCall] },
    { role: "tool", tool_call_id: toolCall.id, content: '{"temp_c":18}' },
  ]);

  expect(requests.at(-1)!.contents[1]!.parts[0]!.thoughtSignature).toBe("sig-from-gemini");
});
