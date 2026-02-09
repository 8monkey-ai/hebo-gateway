import { MockLanguageModelV3 } from "ai/test";
import { expect, test } from "bun:test";

import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { CANONICAL_MODEL_IDS } from "../../models/types";
import { cohereDimensionsMiddleware, cohereReasoningMiddleware } from "./middleware";

test("cohere middleware > matching patterns", () => {
  const languageMatching = [
    "cohere/command-a-reasoning",
  ] satisfies (typeof CANONICAL_MODEL_IDS)[number][];

  const languageNonMatching = [
    "cohere/command-a",
    "cohere/command-r-plus",
  ] satisfies (typeof CANONICAL_MODEL_IDS)[number][];

  for (const id of languageMatching) {
    const middleware = modelMiddlewareMatcher.resolve({ kind: "text", modelId: id });
    expect(middleware).toContain(cohereReasoningMiddleware);
  }

  for (const id of languageNonMatching) {
    const middleware = modelMiddlewareMatcher.resolve({ kind: "text", modelId: id });
    expect(middleware).not.toContain(cohereReasoningMiddleware);
  }

  const embeddingMatching = [
    "cohere/embed-v4.0",
    "cohere/embed-english-v3.0",
  ] satisfies (typeof CANONICAL_MODEL_IDS)[number][];

  const embeddingNonMatching = [
    "cohere/command-a",
  ] satisfies (typeof CANONICAL_MODEL_IDS)[number][];

  for (const id of embeddingMatching) {
    const middleware = modelMiddlewareMatcher.resolve({ kind: "embedding", modelId: id });
    expect(middleware).toContain(cohereDimensionsMiddleware);
  }

  for (const id of embeddingNonMatching) {
    const middleware = modelMiddlewareMatcher.resolve({ kind: "embedding", modelId: id });
    expect(middleware).not.toContain(cohereDimensionsMiddleware);
  }
});

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

test("cohereReasoningMiddleware > should default reasoning budget when enabled without effort", async () => {
  const params = {
    prompt: [],
    maxOutputTokens: 4000,
    providerOptions: {
      unknown: {
        reasoning: { enabled: true },
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
    maxOutputTokens: 4000,
    providerOptions: {
      cohere: {
        thinking: {
          type: "enabled",
        },
      },
      unknown: {},
    },
  });
});
