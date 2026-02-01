import { MockLanguageModelV3 } from "ai/test";
import { expect, test } from "bun:test";

import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { CANONICAL_MODEL_IDS } from "../../models/types";
import { claudeReasoningMiddleware } from "./middleware";

test("anthropicReasoningMiddleware > matching patterns", () => {
  const matching = [
    "anthropic/claude-sonnet-3.7",
    "anthropic/claude-opus-4.5",
    "anthropic/claude-sonnet-4.5",
    "anthropic/claude-haiku-4.5",
    "anthropic/claude-opus-4.1",
    "anthropic/claude-sonnet-4",
    "anthropic/claude-opus-4",
  ] satisfies (typeof CANONICAL_MODEL_IDS)[number][];

  const nonMatching = [
    "anthropic/claude-sonnet-3.5",
    "anthropic/claude-haiku-3.5",
    "anthropic/claude-haiku-3",
  ] satisfies (typeof CANONICAL_MODEL_IDS)[number][];

  for (const id of matching) {
    const middleware = modelMiddlewareMatcher.for(id, "anthropic");
    expect(middleware).toContain(claudeReasoningMiddleware);
  }

  for (const id of nonMatching) {
    const middleware = modelMiddlewareMatcher.for(id, "anthropic");
    expect(middleware).not.toContain(claudeReasoningMiddleware);
  }
});

test("anthropicReasoningMiddleware > should transform reasoning_effort string to thinking budget", async () => {
  const params = {
    prompt: [],
    maxOutputTokens: 10000,
    providerOptions: {
      unknown: {
        reasoning: { effort: "high" },
      },
    },
  };

  const result = await claudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3(),
  });

  expect(result).toEqual({
    prompt: [],
    maxOutputTokens: 10000,
    providerOptions: {
      anthropic: {
        thinking: {
          type: "enabled",
          budgetTokens: 8000,
        },
      },
      unknown: {},
    },
  });
});

test("anthropicReasoningMiddleware > should respect Anthropic minimum budget of 1024", async () => {
  const params = {
    prompt: [],
    maxOutputTokens: 2000,
    providerOptions: {
      unknown: {
        reasoning: { effort: "minimal" },
      },
    },
  };

  const result = await claudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3(),
  });

  expect(result).toEqual({
    prompt: [],
    maxOutputTokens: 2000,
    providerOptions: {
      anthropic: {
        thinking: {
          type: "enabled",
          budgetTokens: 1024,
        },
      },
      unknown: {},
    },
  });
});

test("anthropicReasoningMiddleware > should transform reasoning object to thinking budget", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: {
          effort: "medium",
          max_tokens: 2000,
        },
      },
    },
  };

  const result = await claudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3(),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      anthropic: {
        thinking: {
          type: "enabled",
          budgetTokens: 2000,
        },
      },
      unknown: {},
    },
  });
});

test("anthropicReasoningMiddleware > should handle disabled reasoning", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: {
          enabled: false,
        },
      },
    },
  };

  const result = await claudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3(),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      anthropic: {
        thinking: {
          type: "disabled",
        },
      },
      unknown: {},
    },
  });
});

test("anthropicReasoningMiddleware > should use 64k as default fallback for maxOutputTokens", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { effort: "medium" }, // 0.5 * 64000 = 32000
      },
    },
  };

  const result = await claudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3(),
  });

  expect(result.providerOptions.anthropic.thinking.budgetTokens).toBe(32000);
});
