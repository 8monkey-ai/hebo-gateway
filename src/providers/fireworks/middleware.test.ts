import { expect, test } from "bun:test";

import { MockLanguageModelV3 } from "ai/test";

import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { fireworksReasoningMiddleware } from "./middleware";

test("fireworks middlewares > matching provider resolves reasoning middleware", () => {
  const middleware = modelMiddlewareMatcher.resolve({
    kind: "text",
    providerId: "fireworks",
  });

  expect(middleware).toContain(fireworksReasoningMiddleware);
});

test("fireworksReasoningMiddleware > should enable thinking with budget from effort", async () => {
  const params = {
    prompt: [],
    maxOutputTokens: 16384,
    providerOptions: {
      fireworks: {
        reasoning: { enabled: true, effort: "medium" },
      },
    },
  };

  const result = await fireworksReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "minimax/m2.7" }),
  });

  expect(result.providerOptions!["fireworks"]).toEqual({
    thinking: { type: "enabled", budgetTokens: 8192 },
  });
});

test("fireworksReasoningMiddleware > should enable thinking with explicit max_tokens", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      fireworks: {
        reasoning: { enabled: true, max_tokens: 4096 },
      },
    },
  };

  const result = await fireworksReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "minimax/m2.7" }),
  });

  expect(result.providerOptions!["fireworks"]).toEqual({
    thinking: { type: "enabled", budgetTokens: 4096 },
  });
});

test("fireworksReasoningMiddleware > should disable thinking", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      fireworks: {
        reasoning: { enabled: false },
      },
    },
  };

  const result = await fireworksReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "minimax/m2.7" }),
  });

  expect(result.providerOptions!["fireworks"]).toEqual({
    thinking: { type: "disabled" },
  });
});

test("fireworksReasoningMiddleware > should pass through when no reasoning", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      fireworks: {
        serviceTier: "auto",
      },
    },
  };

  const result = await fireworksReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "minimax/m2.7" }),
  });

  expect(result.providerOptions!["fireworks"]).toEqual({
    serviceTier: "auto",
  });
});
