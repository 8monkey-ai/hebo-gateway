import { MockLanguageModelV3 } from "ai/test";
import { expect, test } from "bun:test";

import { novaReasoningMiddleware } from "./middleware";

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
    model: new MockLanguageModelV3(),
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
    model: new MockLanguageModelV3(),
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
    model: new MockLanguageModelV3(),
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
