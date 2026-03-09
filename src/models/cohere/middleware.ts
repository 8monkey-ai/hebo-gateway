import type { CohereEmbeddingModelOptions, CohereLanguageModelOptions } from "@ai-sdk/cohere";
import type { EmbeddingModelMiddleware, LanguageModelMiddleware } from "ai";

import type { ChatCompletionsReasoningConfig } from "../../endpoints/chat-completions/schema";

import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { calculateReasoningBudgetFromEffort } from "../../middleware/utils";
import type { EmbeddingsDimensions } from "../../endpoints/embeddings";

// Convert `dimensions` (OpenAI) to `outputDimension` (Cohere)
export const cohereDimensionsMiddleware: EmbeddingModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params, model }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const modelId = model.modelId;
    if (
      modelId.includes("cohere/embed-english-light") ||
      modelId.includes("cohere/embed-multilingual-light")
    ) {
      delete unknown["dimensions"];
      return params;
    }

    const dimensions = unknown["dimensions"] as EmbeddingsDimensions;
    if (!dimensions) return params;

    const target = (params.providerOptions!["cohere"] ??= {}) as CohereEmbeddingModelOptions;

    // @ts-expect-error AI SDK does the value checking for us
    target.outputDimension = dimensions;

    delete unknown["dimensions"];

    return params;
  },
};

const COHERE_MAX_OUTPUT_TOKENS = 32000;
export const cohereReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const reasoning = unknown["reasoning"] as ChatCompletionsReasoningConfig;
    if (!reasoning) return params;

    const target = (params.providerOptions!["cohere"] ??= {}) as CohereLanguageModelOptions;

    if (!reasoning.enabled) {
      target.thinking = { type: "disabled" };
    } else if (reasoning.max_tokens) {
      target.thinking = { type: "enabled", tokenBudget: reasoning.max_tokens };
    } else if (reasoning.effort) {
      // FUTURE: warn that reasoning.max_tokens was computed
      target.thinking = {
        type: "enabled",
        tokenBudget: calculateReasoningBudgetFromEffort(
          reasoning.effort,
          params.maxOutputTokens ?? COHERE_MAX_OUTPUT_TOKENS,
          1024,
        ),
      };
    } else {
      target.thinking = { type: "enabled" };
    }

    delete unknown["reasoning"];

    return params;
  },
};

modelMiddlewareMatcher.useForModel("cohere/embed-*", { embedding: [cohereDimensionsMiddleware] });

modelMiddlewareMatcher.useForModel("cohere/command-a-reasoning", {
  language: [cohereReasoningMiddleware],
});
