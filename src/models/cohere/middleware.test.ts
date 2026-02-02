import { MockLanguageModelV3 } from "ai/test";
import { expect, test } from "bun:test";

import { cohereReasoningMiddleware } from "./middleware";

test("cohereReasoningMiddleware > should map effort to thinking budget", async () => {
  const params = {
    prompt: [],
    maxOutputTokens: 2000,
    providerOptions: {
      unknown: {
        reasoning: { enabled: true, effort: "medium" },
      },
    },
  };

  const result = await cohereReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3(),
  });

  expect(result).toEqual({
    prompt: [],
    maxOutputTokens: 2000,
    providerOptions: {
      cohere: {
        thinking: {
          type: "enabled",
          tokenBudget: 1024,
        },
      },
      unknown: {},
    },
  });
});

test("cohereReasoningMiddleware > should disable reasoning when requested", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: false },
      },
    },
  };

  const result = await cohereReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3(),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      cohere: {
        thinking: {
          type: "disabled",
        },
      },
      unknown: {},
    },
  });
});
