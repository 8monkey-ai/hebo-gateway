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
      case "none":
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
      case "none":
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
export const GEMINI_2_5_PRO_MIN_THINKING_BUDGET = 128;

export const geminiReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params, model }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const reasoning = unknown["reasoning"] as ChatCompletionsReasoningConfig;
    if (!reasoning) return params;

    const target = (params.providerOptions!["google"] ??= {});
    const modelId = model.modelId;

    if (modelId.includes("gemini-2")) {
      const is25Pro = modelId.includes("gemini-2.5-pro");

      target["thinkingConfig"] = {
        thinkingBudget:
          reasoning.max_tokens ??
          calculateReasoningBudgetFromEffort(
            reasoning.effort ?? "none",
            params.maxOutputTokens ?? GEMINI_DEFAULT_MAX_OUTPUT_TOKENS,
            is25Pro ? GEMINI_2_5_PRO_MIN_THINKING_BUDGET : 0,
          ),
      };
    } else if (modelId.includes("gemini-3") && reasoning.effort) {
      target["thinkingConfig"] = {
        thinkingLevel: mapGeminiReasoningEffort(reasoning.effort, modelId),
      };
      // FUTURE: warn if model is gemini-3 and max_tokens (unsupported) was ignored
    }

    ((target["thinkingConfig"] ??= {}) as Record<string, unknown>)["includeThoughts"] =
      reasoning.enabled ? !reasoning.exclude : false;

    delete unknown["reasoning"];

    return params;
  },
};

modelMiddlewareMatcher.useForModel("google/gemini-*embedding-*", {
  embedding: [geminiDimensionsMiddleware],
});

modelMiddlewareMatcher.useForModel(["google/gemini-2*", "google/gemini-3*"], {
  language: [geminiReasoningMiddleware],
});
