import { MockLanguageModelV3 } from "ai/test";
import { expect, test } from "bun:test";

import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { calculateReasoningBudgetFromEffort } from "../../middleware/utils";
import { CANONICAL_MODEL_IDS } from "../../models/types";
import { geminiReasoningMiddleware } from "./middleware";

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

  const result = await geminiReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "google/gemini-3-flash-preview" }),
  });

  expect(result).toEqual({
    prompt: [],
    maxOutputTokens: 2000,
    providerOptions: {
      google: {
        thinkingConfig: {
          includeThoughts: true,
          thinkingLevel: "medium",
        },
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

  const result = await geminiReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "google/gemini-3-pro-preview" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      google: {
        thinkingConfig: {
          includeThoughts: true,
          thinkingLevel: "low",
        },
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

  const result = await geminiReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "google/gemini-2.5-flash" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      google: {
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

  const result = await geminiReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "google/gemini-3-flash-preview" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      google: {
        thinkingConfig: {
          includeThoughts: false,
        },
      },
      unknown: {},
    },
  });
});

test("geminiReasoningMiddleware > should default reasoning effort for Gemini 3 Flash", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: true },
      },
    },
  };

  const result = await geminiReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV3({ modelId: "google/gemini-3-flash-preview" }),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      google: {
        thinkingConfig: {
          includeThoughts: true,
        },
      },
      unknown: {},
    },
  });
});
