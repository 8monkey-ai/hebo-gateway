import { expect, test } from "bun:test";

import { MockLanguageModelV3 } from "ai/test";

import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { calculateReasoningBudgetFromEffort } from "../../middleware/utils";
import { CANONICAL_MODEL_IDS } from "../../models/types";
import { qwenReasoningMiddleware } from "./middleware";

test("qwenReasoningMiddleware > matching patterns", () => {
  const matching = [
    "alibaba/qwen3-235b",
    "alibaba/qwen3-32b",
    "alibaba/qwen3.5-plus",
    "alibaba/qwen3.5-flash",
    "alibaba/qwen3.5-27b",
    "alibaba/qwen3.6-plus",
    "alibaba/qwen3.6-flash",
    "alibaba/qwen3.6-max-preview",
    "alibaba/qwen3-coder-next",
    "alibaba/qwen3-vl-235b",
  ] satisfies (typeof CANONICAL_MODEL_IDS)[number][];

  const nonMatching = [
    "openai/gpt-5",
    "anthropic/claude-opus-4.7",
    "google/gemini-3-flash-preview",
  ];

  for (const id of matching) {
    const middleware = modelMiddlewareMatcher.resolve({ kind: "text", modelId: id });
    expect(middleware).toContain(qwenReasoningMiddleware);
  }

  for (const id of nonMatching) {
    const middleware = modelMiddlewareMatcher.resolve({ kind: "text", modelId: id });
    expect(middleware).not.toContain(qwenReasoningMiddleware);
  }
});

test("qwenReasoningMiddleware > should enable thinking with medium effort", async () => {
  const params = {
    prompt: [],
    maxOutputTokens: 8192,
    providerOptions: {
      unknown: {
        reasoning: { enabled: true, effort: "medium" },
      },
    },
  };

  const result = await qwenReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "alibaba/qwen3-235b" }),
  });

  expect(result).toEqual({
    prompt: [],
    maxOutputTokens: 8192,
    providerOptions: {
      alibaba: {
        enableThinking: true,
        thinkingBudget: calculateReasoningBudgetFromEffort("medium", 8192),
      },
      unknown: {
        reasoning: undefined,
      },
    },
  });
});

test("qwenReasoningMiddleware > should disable thinking with none effort", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: false, effort: "none" },
      },
    },
  };

  const result = await qwenReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "alibaba/qwen3.5-plus" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      alibaba: {
        enableThinking: false,
        thinkingBudget: undefined,
      },
      unknown: {
        reasoning: undefined,
      },
    },
  });
});

test("qwenReasoningMiddleware > should use explicit max_tokens", async () => {
  const params = {
    prompt: [],
    maxOutputTokens: 8192,
    providerOptions: {
      unknown: {
        reasoning: { enabled: true, max_tokens: 4096 },
      },
    },
  };

  const result = await qwenReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "alibaba/qwen3-coder-next" }),
  });

  expect(result).toEqual({
    prompt: [],
    maxOutputTokens: 8192,
    providerOptions: {
      alibaba: {
        enableThinking: true,
        thinkingBudget: 4096,
      },
      unknown: {
        reasoning: undefined,
      },
    },
  });
});

test("qwenReasoningMiddleware > should use default max tokens when not specified", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: true, effort: "high" },
      },
    },
  };

  const result = await qwenReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "alibaba/qwen3-235b" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      alibaba: {
        enableThinking: true,
        thinkingBudget: calculateReasoningBudgetFromEffort("high", 16384),
      },
      unknown: {
        reasoning: undefined,
      },
    },
  });
});

test("qwenReasoningMiddleware > should map all effort levels to correct budgets", async () => {
  const maxTokens = 8192;
  const cases = [
    { effort: "minimal" as const, enabled: true },
    { effort: "low" as const, enabled: true },
    { effort: "medium" as const, enabled: true },
    { effort: "high" as const, enabled: true },
    { effort: "xhigh" as const, enabled: true },
    { effort: "max" as const, enabled: true },
  ];

  await Promise.all(
    cases.map(async ({ effort, enabled }) => {
      const params = {
        prompt: [],
        maxOutputTokens: maxTokens,
        providerOptions: {
          unknown: {
            reasoning: { enabled, effort },
          },
        },
      };

      const result = await qwenReasoningMiddleware.transformParams!({
        type: "generate",
        params,
        model: new MockLanguageModelV3({ modelId: "alibaba/qwen3-235b" }),
      });

      expect(result).toEqual({
        prompt: [],
        maxOutputTokens: maxTokens,
        providerOptions: {
          alibaba: {
            enableThinking: true,
            thinkingBudget: calculateReasoningBudgetFromEffort(effort, maxTokens),
          },
          unknown: {
            reasoning: undefined,
          },
        },
      });
    }),
  );
});

test("qwenReasoningMiddleware > should clear pre-existing enableThinking when disabled", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      alibaba: {
        enableThinking: true,
      },
      unknown: {
        reasoning: { enabled: false },
      },
    },
  };

  const result = await qwenReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "alibaba/qwen3-235b" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      alibaba: {
        enableThinking: false,
        thinkingBudget: undefined,
      },
      unknown: {
        reasoning: undefined,
      },
    },
  });
});

test("qwenReasoningMiddleware > should skip when no reasoning config", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {},
    },
  };

  const result = await qwenReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "alibaba/qwen3-235b" }),
  });

  expect(result).toEqual(params);
});
