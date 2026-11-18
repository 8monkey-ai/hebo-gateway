import { expect, test } from "bun:test";

import { MockLanguageModelV4 } from "ai/test";

import { modelMiddlewareMatcher } from "../../middleware/matcher.ts";
import { novaDimensionsMiddleware, novaReasoningMiddleware } from "./middleware.ts";

test("nova middleware > matching patterns", () => {
  const languageMatching = ["amazon/nova-2-lite"];

  const languageNonMatching = [
    "amazon/nova-micro",
    "amazon/nova-lite",
    "amazon/nova-pro",
    "amazon/nova-premier",
  ];

  for (const id of languageMatching) {
    const middleware = modelMiddlewareMatcher.resolve({ kind: "text", modelId: id });
    expect(middleware).toContain(novaReasoningMiddleware);
  }

  for (const id of languageNonMatching) {
    const middleware = modelMiddlewareMatcher.resolve({ kind: "text", modelId: id });
    expect(middleware).not.toContain(novaReasoningMiddleware);
  }

  const embeddingMatching = ["amazon/nova-2-multimodal-embeddings"];

  const embeddingNonMatching = ["amazon/nova-2-lite"];

  for (const id of embeddingMatching) {
    const middleware = modelMiddlewareMatcher.resolve({ kind: "embedding", modelId: id });
    expect(middleware).toContain(novaDimensionsMiddleware);
  }

  for (const id of embeddingNonMatching) {
    const middleware = modelMiddlewareMatcher.resolve({ kind: "embedding", modelId: id });
    expect(middleware).not.toContain(novaDimensionsMiddleware);
  }
});

test("novaReasoningMiddleware > should map effort to Bedrock reasoning config", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: true, effort: "low" },
      },
    },
  };

  const result = await novaReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV4(),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      amazon: {
        reasoningConfig: {
          type: "enabled",
          maxReasoningEffort: "low",
        },
      },
      unknown: {},
    },
  });
});

test("novaReasoningMiddleware > should disable reasoning when requested", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: false },
      },
    },
  };

  const result = await novaReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV4(),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      amazon: {
        reasoningConfig: {
          type: "disabled",
        },
      },
      unknown: {},
    },
  });
});

test("novaReasoningMiddleware > should default reasoning effort when enabled without effort", async () => {
  const params = {
    prompt: [],
    providerOptions: {
      unknown: {
        reasoning: { enabled: true },
      },
    },
  };

  const result = await novaReasoningMiddleware.transformParams!({
    type: "generate",
    params,
    model: new MockLanguageModelV4(),
  });

  expect(result).toEqual({
    prompt: [],
    providerOptions: {
      amazon: {
        reasoningConfig: {
          type: "enabled",
        },
      },
      unknown: {},
    },
  });
});
