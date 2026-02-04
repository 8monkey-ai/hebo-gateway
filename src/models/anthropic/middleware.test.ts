import { MockLanguageModelV3 } from "ai/test";
import { expect, test } from "bun:test";

import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { CANONICAL_MODEL_IDS } from "../../models/types";
import { claudeReasoningMiddleware } from "./middleware";

test("claudeReasoningMiddleware > matching patterns", () => {
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
    const middleware = modelMiddlewareMatcher.forModel(id);
    expect(middleware).toContain(claudeReasoningMiddleware);
  }

  for (const id of nonMatching) {
    const middleware = modelMiddlewareMatcher.forModel(id);
    expect(middleware).not.toContain(claudeReasoningMiddleware);
  }
});

test("claudeReasoningMiddleware > should transform reasoning_effort string to thinking budget", async () => {
  const params = {
    prompt: [],
    maxOutputTokens: 10000,
    providerOptions: {
      unknown: {
        reasoning: { enabled: true, effort: "high" },
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

test("claudeReasoningMiddleware > should respect Anthropic minimum budget of 1024", async () => {
  const params = {
    prompt: [],
    maxOutputTokens: 2000,
    providerOptions: {
      unknown: {
        reasoning: { enabled: true, effort: "minimal" },
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

test("claudeReasoningMiddleware > should transform reasoning object to thinking budget", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: {
          enabled: true,
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

test("claudeReasoningMiddleware > should handle disabled reasoning", async () => {
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

test("claudeReasoningMiddleware > should default reasoning budget when enabled without effort", async () => {
  const params = {
    prompt: [],
    maxOutputTokens: 10000,
    providerOptions: {
      unknown: {
        reasoning: {
          enabled: true,
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
    maxOutputTokens: 10000,
    providerOptions: {
      anthropic: {
        thinking: {
          type: "enabled",
        },
      },
      unknown: {},
    },
  });
});

test("claudeReasoningMiddleware > should use 64k as default fallback for maxOutputTokens", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: {
          // 0.5 * 64000 = 32000
          enabled: true,
          effort: "medium",
        },
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

test("claudeReasoningMiddleware > should cap default maxOutputTokens for Opus 4.1", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: {
          enabled: true,
          effort: "medium",
        },
      },
    },
  };

  const result = await claudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "anthropic/claude-opus-4.1" }),
  });

  expect(result.providerOptions.anthropic.thinking.budgetTokens).toBe(16000);
});

test("claudeReasoningMiddleware > should clamp max_tokens for Opus 4", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: {
          enabled: true,
          max_tokens: 50000,
        },
      },
    },
  };

  const result = await claudeReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "anthropic/claude-opus-4" }),
  });

  expect(result.providerOptions.anthropic.thinking.budgetTokens).toBe(32000);
});
