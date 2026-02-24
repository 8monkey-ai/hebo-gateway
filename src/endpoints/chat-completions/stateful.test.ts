import { simulateReadableStream } from "ai";
import { MockLanguageModelV3, MockProviderV3 } from "ai/test";
import { describe, expect, test } from "bun:test";

import { parseResponse, postJson } from "../../../test/helpers/http";
import { defineModelCatalog } from "../../models/catalog";
import { InMemoryStorage } from "../../storage/memory";
import { chatCompletions } from "./handler";

describe("Stateful Chat Completions", () => {
  const storage = new InMemoryStorage();
  const mockLanguageModel = new MockLanguageModelV3({
    // eslint-disable-next-line require-await
    doGenerate: async (options) => {
      const messages = options.prompt;
      // Return the number of messages to verify injection
      return {
        finishReason: { unified: "stop", raw: "stop" },
        usage: {
          inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 0, text: 0, reasoning: 0 },
        },
        content: [{ type: "text", text: `I see ${messages.length} messages` }],
        warnings: [],
      };
    },
    // eslint-disable-next-line require-await
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-delta", delta: "Hello", id: "1" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: "stop" },
            usage: {
              inputTokens: { total: 5, noCache: 5, cacheRead: 0, cacheWrite: 0 },
              outputTokens: { total: 5, text: 5, reasoning: 0 },
            },
          },
        ],
      }),
    }),
  });

  const endpoint = chatCompletions({
    providers: {
      groq: new MockProviderV3({
        languageModels: { "gpt-4": mockLanguageModel },
      }),
    },
    models: defineModelCatalog({
      "gpt-4": {
        name: "GPT-4",
        modalities: { input: ["text"], output: ["text"] },
        providers: ["groq"],
      },
    }),
    storage,
    telemetry: { enabled: false },
  } as any);

  test("should inject history and save response", async () => {
    const conv = await storage.createConversation({});
    await storage.addItems(conv.id, [
      { role: "system", content: "You are a helper" },
      { role: "user", content: "Previous message" },
    ]);

    const request = postJson("http://localhost/chat/completions", {
      model: "gpt-4",
      conversation_id: conv.id,
      messages: [{ role: "user", content: "Current message" }],
    });

    const res = await endpoint.handler(request);
    expect(res.status).toBe(200);
    const data = await parseResponse(res);

    // History (2) + New User Message (1) = 3 messages
    expect(data.choices[0].message.content).toBe("I see 3 messages");

    // Check if conversation now has: history(2) + new user(1) + assistant(1) = 4 items
    const items = await storage.listItems(conv.id);
    expect(items).toHaveLength(4);
    expect(items[2].message.content).toBe("Current message");
    expect(items[3].message.content).toBe("I see 3 messages");
  });
});
