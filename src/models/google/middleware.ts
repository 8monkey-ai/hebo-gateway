import type { EmbeddingModelMiddleware, LanguageModelMiddleware } from "ai";

import type {
  ChatCompletionsReasoningConfig,
  ChatCompletionsReasoningEffort,
} from "../../endpoints/chat-completions/schema";

import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { calculateReasoningBudgetFromEffort } from "../../middleware/utils";

// Convert `dimensions` (OpenAI) to `outputDimensionality` (Google)
export const geminiDimensionsMiddleware: EmbeddingModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const dimensions = unknown["dimensions"] as number;
    if (!dimensions) return params;

    (params.providerOptions!["google"] ??= {})["outputDimensionality"] = dimensions;
    delete unknown["dimensions"];

    return params;
  },
};

export function mapGeminiReasoningEffort(
  effort: ChatCompletionsReasoningEffort,
  modelId: string,
): ChatCompletionsReasoningEffort | undefined {
  if (modelId.includes("gemini-3-pro")) {
    switch (effort) {
      case "minimal":
      case "low":
        return "low";
      case "medium":
      case "high":
      case "xhigh":
        return "high";
    }
  }

  if (modelId.includes("gemini-3-flash")) {
    switch (effort) {
      case "minimal":
        return "minimal";
      case "low":
        return "low";
      case "medium":
        return "medium";
      case "high":
      case "xhigh":
        return "high";
    }
  }

  return effort;
}

export const GEMINI_DEFAULT_MAX_OUTPUT_TOKENS = 65536;

export const geminiReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params, model }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const reasoning = unknown["reasoning"] as ChatCompletionsReasoningConfig;
    if (!reasoning) return params;

    const target = (params.providerOptions!["google"] ??= {});

    if (model.modelId.includes("gemini-2") && reasoning.max_tokens) {
      target["thinkingConfig"] = {
        thinkingBudget: reasoning.max_tokens,
      };
    } else if (model.modelId.includes("gemini-2") && reasoning.effort) {
      // FUTURE: warn that reasoning.max_tokens was computed
      target["thinkingConfig"] = {
        thinkingBudget: calculateReasoningBudgetFromEffort(
          reasoning.effort,
          params.maxOutputTokens ?? GEMINI_DEFAULT_MAX_OUTPUT_TOKENS,
        ),
      };
    } else if (model.modelId.includes("gemini-3") && reasoning.effort) {
      // FUTURE: warn if mapGeminiReasoningEffort modified value
      target["thinkingConfig"] = {
        thinkingLevel: mapGeminiReasoningEffort(reasoning.effort, model.modelId),
      };
    }
    // FUTURE: warn if model is gemini-3 and max_tokens (unsupported) was ignored

    ((target["thinkingConfig"] ??= {}) as Record<string, unknown>)["includeThoughts"] =
      reasoning.enabled ? !reasoning.exclude : false;

    delete unknown["reasoning"];

    return params;
  },
};

modelMiddlewareMatcher.useForModel("google/gemini-*embedding-*", {
  embedding: geminiDimensionsMiddleware,
});

modelMiddlewareMatcher.useForModel(["google/gemini-2*", "google/gemini-3*"], {
  language: geminiReasoningMiddleware,
});
