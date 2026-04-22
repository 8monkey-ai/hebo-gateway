import { expect, test } from "bun:test";

import { MockLanguageModelV3 } from "ai/test";

import { modelMiddlewareMatcher } from "../../middleware/matcher";
import type { CANONICAL_MODEL_IDS } from "../../models/types";
import { deepseekReasoningMiddleware } from "./middleware";

test("deepseek middleware > matching patterns", () => {
  const languageMatching = [
    "deepseek/deepseek-v3.2",
  ] satisfies (typeof CANONICAL_MODEL_IDS)[number][];

  for (const id of languageMatching) {
    const middleware = modelMiddlewareMatcher.resolve({ kind: "text", modelId: id });
    expect(middleware).toContain(deepseekReasoningMiddleware);
  }
});

test("deepseekReasoningMiddleware > should enable thinking when reasoning enabled", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: true },
      },
    },
  };

  const result = await deepseekReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3(),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      deepseek: { thinking: { type: "enabled" } },
      unknown: {},
    },
  });
});

test("deepseekReasoningMiddleware > should enable thinking with effort", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: true, effort: "high" },
      },
    },
  };

  const result = await deepseekReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3(),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      deepseek: { thinking: { type: "enabled" } },
      unknown: {},
    },
  });
});

test("deepseekReasoningMiddleware > should disable thinking when reasoning disabled", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: false },
      },
    },
  };

  const result = await deepseekReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3(),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      deepseek: { thinking: { type: "disabled" } },
      unknown: {},
    },
  });
});

test("deepseekReasoningMiddleware > should disable thinking with none effort", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: true, effort: "none" },
      },
    },
  };

  const result = await deepseekReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3(),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      deepseek: { thinking: { type: "disabled" } },
      unknown: {},
    },
  });
});

test("deepseekReasoningMiddleware > should pass through when no reasoning config", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {},
    },
  };

  const result = await deepseekReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3(),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      unknown: {},
    },
  });
});

test("deepseekReasoningMiddleware > should pass through when no unknown namespace", async () => {
  const params = {
    prompt: [],
    providerOptions: {},
  };

  const result = await deepseekReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3(),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {},
  });
});
