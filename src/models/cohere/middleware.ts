import type { EmbeddingModelMiddleware, LanguageModelMiddleware } from "ai";

import type { ChatCompletionsReasoningConfig } from "../../endpoints/chat-completions/schema";

import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { calculateReasoningBudgetFromEffort } from "../../middleware/utils";

// Convert `dimensions` (OpenAI) to `outputDimension` (Cohere)
export const cohereDimensionsMiddleware: EmbeddingModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    let dimensions = unknown["dimensions"] as number;
    if (!dimensions) dimensions = 1024;

    (params.providerOptions!["cohere"] ??= {})["outputDimension"] = dimensions;
    delete unknown["dimensions"];

    return params;
  },
};

const COHERE_MAX_OUTPUT_TOKENS = 32000;
export const cohereReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const reasoning = unknown["reasoning"] as ChatCompletionsReasoningConfig;
    if (!reasoning) return params;

    const target = (params.providerOptions!["cohere"] ??= {});

    if (!reasoning.enabled) {
      target["thinking"] = { type: "disabled" };
    } else if (reasoning.max_tokens) {
      target["thinking"] = { type: "enabled", tokenBudget: reasoning.max_tokens };
    } else if (reasoning.effort) {
      // FUTURE: Issue warning that reasoning.max_tokens was computed
      target["thinking"] = {
        type: "enabled",
        tokenBudget: calculateReasoningBudgetFromEffort(
          reasoning.effort,
          params.maxOutputTokens ?? COHERE_MAX_OUTPUT_TOKENS,
          1024,
        ),
      };
    }

    delete unknown["reasoning"];

    return params;
  },
};

modelMiddlewareMatcher.useForModel("cohere/embed-*", { embedding: cohereDimensionsMiddleware });

modelMiddlewareMatcher.useForModel("cohere/command-a-reasoning", {
  language: cohereReasoningMiddleware,
});
