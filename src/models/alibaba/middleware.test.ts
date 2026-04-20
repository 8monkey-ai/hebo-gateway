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
    "alibaba/qwen3-max",
    "alibaba/qwen3.5-plus",
    "alibaba/qwen3.6-plus",
    "alibaba/qwen3-coder-plus",
    "alibaba/qwen3-vl-plus",
  ] satisfies (typeof CANONICAL_MODEL_IDS)[number][];

  const nonMatching = ["openai/gpt-5", "anthropic/claude-opus-4.7", "google/gemini-3-flash-preview"];

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
      unknown: {},
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
    model: new MockLanguageModelV3({ modelId: "alibaba/qwen3.6-plus" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      alibaba: {
        enableThinking: false,
      },
      unknown: {},
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
    model: new MockLanguageModelV3({ modelId: "alibaba/qwen3-coder-plus" }),
  });

  expect(result).toEqual({
    prompt: [],
    maxOutputTokens: 8192,
    providerOptions: {
      alibaba: {
        enableThinking: true,
        thinkingBudget: 4096,
      },
      unknown: {},
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
      unknown: {},
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

