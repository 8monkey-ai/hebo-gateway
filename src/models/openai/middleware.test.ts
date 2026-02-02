import { MockLanguageModelV3 } from "ai/test";
import { expect, test } from "bun:test";

import { openAIReasoningMiddleware } from "./middleware";

test("openAIReasoningMiddleware > should map reasoning effort to OpenAI provider options", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: true, effort: "high" },
      },
    },
  };

  const result = await openAIReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3(),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      openai: {
        reasoningEffort: "high",
      },
      unknown: {},
    },
  });
});

test("openAIReasoningMiddleware > should disable reasoning when requested", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: false },
      },
    },
  };

  const result = await openAIReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3(),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      openai: {
        reasoningEffort: "none",
      },
      unknown: {},
    },
  });
});
