import { MockLanguageModelV3 } from "ai/test";
import { expect, test } from "bun:test";

import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { calculateReasoningBudgetFromEffort } from "../../middleware/utils";
import { CANONICAL_MODEL_IDS } from "../../models/types";
import {
  createGeminiReasoningBudgetMiddleware,
  createGeminiReasoningEffortMiddleware,
  mapGemini3FlashEffort,
  mapGemini3ProEffort,
} from "./middleware";

test("geminiReasoningMiddleware > matching patterns", () => {
  const matching = [
    "google/gemini-2.5-flash-lite",
    "google/gemini-2.5-flash",
    "google/gemini-2.5-pro",
    "google/gemini-3-flash-preview",
    "google/gemini-3-pro-preview",
  ] satisfies (typeof CANONICAL_MODEL_IDS)[number][];

  const nonMatching = ["google/gemini-1.5-pro", "google/gemini-1.5-flash"];

  for (const id of matching) {
    const middleware = modelMiddlewareMatcher.for(id, "google");
    expect(middleware.length).toBe(2);
  }

  for (const id of nonMatching) {
    const middleware = modelMiddlewareMatcher.for(id, "google");
    expect(middleware.length).toBe(1);
  }
});

test("geminiReasoningMiddleware > should enable thinking for Gemini 3 Flash effort", async () => {
  const params = {
    prompt: [],
    maxOutputTokens: 2000,
    providerOptions: {
      unknown: {
        reasoning: { enabled: true, effort: "medium" },
      },
    },
  };

  const gemini3Flash = createGeminiReasoningEffortMiddleware({
    mapEffort: mapGemini3FlashEffort,
  });

  const result = await gemini3Flash.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "google/gemini-3-flash-preview" }),
  });

  expect(result).toEqual({
    prompt: [],
    maxOutputTokens: 2000,
    providerOptions: {
      gemini: {
        thinkingConfig: {
          includeThoughts: true,
        },
        reasoningEffort: "medium",
      },
      unknown: {},
    },
  });
});

test("geminiReasoningMiddleware > should map effort for Gemini 3 Pro", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: true, effort: "minimal" },
      },
    },
  };

  const gemini3Pro = createGeminiReasoningEffortMiddleware({
    mapEffort: mapGemini3ProEffort,
  });

  const result = await gemini3Pro.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "google/gemini-3-pro-preview" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      gemini: {
        thinkingConfig: {
          includeThoughts: true,
        },
        reasoningEffort: "low",
      },
      unknown: {},
    },
  });
});

test("geminiReasoningMiddleware > should use budget for Gemini 2", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: true, effort: "medium" },
      },
    },
  };

  const gemini2 = createGeminiReasoningBudgetMiddleware();

  const result = await gemini2.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "google/gemini-2.5-flash" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      gemini: {
        thinkingConfig: {
          includeThoughts: true,
          thinkingBudget: calculateReasoningBudgetFromEffort("medium", 65536),
        },
      },
      unknown: {},
    },
  });
});

test("geminiReasoningMiddleware > should handle disabled reasoning", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: false, effort: "none" },
      },
    },
  };

  const gemini3Flash = createGeminiReasoningEffortMiddleware({
    mapEffort: mapGemini3FlashEffort,
  });

  const result = await gemini3Flash.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "google/gemini-3-flash-preview" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      gemini: {
        thinkingConfig: {
          includeThoughts: false,
        },
      },
      unknown: {},
    },
  });
});
