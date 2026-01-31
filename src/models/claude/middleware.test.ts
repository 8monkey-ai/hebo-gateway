import { expect, test } from "bun:test";

import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { CANONICAL_MODEL_IDS } from "../../models/types";
import { anthropicReasoningMiddleware } from "./middleware";

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
    const middleware = modelMiddlewareMatcher.forLanguage(id, "anthropic");
    expect(middleware).toContain(anthropicReasoningMiddleware);
  }

  for (const id of nonMatching) {
    const middleware = modelMiddlewareMatcher.forLanguage(id, "anthropic");
    expect(middleware).not.toContain(anthropicReasoningMiddleware);
  }
});

test("anthropicReasoningMiddleware > should transform reasoning_effort string to thinking budget", async () => {
  const params: any = {
    maxOutputTokens: 10000,
    providerOptions: {
      unhandled: {
        reasoning: { effort: "high" },
      },
    },
  };

  const result = await anthropicReasoningMiddleware.transformParams!({
    params,
    type: "generate",
  });

  expect(result).toEqual({
    maxOutputTokens: 10000,
    providerOptions: {
      anthropic: {
        thinking: {
          type: "enabled",
          budgetTokens: 8000,
        },
      },
      unhandled: {},
    },
  });
});

test("anthropicReasoningMiddleware > should respect Anthropic minimum budget of 1024", async () => {
  const params: any = {
    maxOutputTokens: 2000,
    providerOptions: {
      unhandled: {
        reasoning: { effort: "minimal" },
      },
    },
  };

  const result = await anthropicReasoningMiddleware.transformParams!({
    params,
    type: "generate",
  });

  expect(result).toEqual({
    maxOutputTokens: 2000,
    providerOptions: {
      anthropic: {
        thinking: {
          type: "enabled",
          budgetTokens: 1024,
        },
      },
      unhandled: {},
    },
  });
});

test("anthropicReasoningMiddleware > should transform reasoning object to thinking budget", async () => {
  const params: any = {
    providerOptions: {
      unhandled: {
        reasoning: {
          effort: "medium",
          max_tokens: 2000,
        },
      },
    },
  };

  const result = await anthropicReasoningMiddleware.transformParams!({
    params,
    type: "generate",
  });

  expect(result).toEqual({
    providerOptions: {
      anthropic: {
        thinking: {
          type: "enabled",
          budgetTokens: 2000,
        },
      },
      unhandled: {},
    },
  });
});

test("anthropicReasoningMiddleware > should handle disabled reasoning", async () => {
  const params: any = {
    providerOptions: {
      unhandled: {
        reasoning: {
          enabled: false,
        },
      },
    },
  };

  const result = await anthropicReasoningMiddleware.transformParams!({
    params,
    type: "generate",
  });

  expect(result).toEqual({
    providerOptions: {
      anthropic: {
        thinking: {
          type: "disabled",
        },
      },
      unhandled: {},
    },
  });
});

test("anthropicReasoningMiddleware > should use 64k as default fallback for maxOutputTokens", async () => {
  const params: any = {
    providerOptions: {
      unhandled: {
        reasoning: { effort: "medium" }, // 0.5 * 64000 = 32000
      },
    },
  };

  const result = await anthropicReasoningMiddleware.transformParams!({
    params,
    type: "generate",
  });

  expect(result.providerOptions.anthropic.thinking.budgetTokens).toBe(32000);
});
