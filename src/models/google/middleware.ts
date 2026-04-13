import type { GoogleLanguageModelOptions } from "@ai-sdk/google";
import type { GoogleVertexEmbeddingModelOptions } from "@ai-sdk/google-vertex";
import type { OpenAIChatLanguageModelOptions } from "@ai-sdk/openai";
import type { EmbeddingModelMiddleware, LanguageModelMiddleware } from "ai";

import type {
  ChatCompletionsReasoningConfig,
  ChatCompletionsReasoningEffort,
} from "../../endpoints/chat-completions/schema";
import type { EmbeddingsDimensions } from "../../endpoints/embeddings";
import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { calculateReasoningBudgetFromEffort } from "../../middleware/utils";

// Convert `dimensions` (OpenAI) to `outputDimensionality` (Google)
export const geminiDimensionsMiddleware: EmbeddingModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const dimensions = unknown["dimensions"] as EmbeddingsDimensions;
    if (!dimensions) return params;

    const target = (params.providerOptions!["google"] ??= {}) as GoogleVertexEmbeddingModelOptions;
    target.outputDimensionality = dimensions;
    delete unknown["dimensions"];

    return params;
  },
};

// https://ai.google.dev/gemini-api/docs/thinking#thinking-levels
export function mapGeminiReasoningEffort(
  effort: ChatCompletionsReasoningEffort,
  modelId: string,
): "minimal" | "low" | "medium" | "high" | undefined {
  if (modelId.includes("pro")) {
    switch (effort) {
      case "none":
      case "minimal":
      case "low":
        return "low";
      case "medium":
        return "medium";
      case "high":
      case "xhigh":
        return "high";
    }
  }

  // Flash
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

  return undefined;
}

export const GEMINI_DEFAULT_MAX_OUTPUT_TOKENS = 65536;
export const GEMINI_2_5_PRO_MIN_THINKING_BUDGET = 128;

export const geminiReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params, model }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    // If thinking options exist, just pass through
    if (unknown["thinking_config"]) return params;

    const reasoning = unknown["reasoning"] as ChatCompletionsReasoningConfig;
    if (!reasoning) return params;

    const target = (params.providerOptions!["google"] ??= {}) as GoogleLanguageModelOptions;
    const modelId = model.modelId;

    if (modelId.includes("gemini-2")) {
      const is25Pro = modelId.includes("gemini-2.5-pro");

      target.thinkingConfig = {
        thinkingBudget:
          reasoning.max_tokens ??
          calculateReasoningBudgetFromEffort(
            reasoning.effort ?? "none",
            params.maxOutputTokens ?? GEMINI_DEFAULT_MAX_OUTPUT_TOKENS,
            is25Pro ? GEMINI_2_5_PRO_MIN_THINKING_BUDGET : 0,
          ),
      };
    } else if (modelId.includes("gemini-3") && reasoning.effort) {
      if (reasoning.effort === "none") {
        // thinkingBudget: 0 fully disables thinking (thinkingLevel: "minimal" still allows some)
        target.thinkingConfig = { thinkingBudget: 0 };
      } else {
        target.thinkingConfig = {
          thinkingLevel: mapGeminiReasoningEffort(reasoning.effort, modelId),
        };
      }
      // FUTURE: warn if model is gemini-3 and max_tokens (unsupported) was ignored
    }

    const thinkingConfig = (target.thinkingConfig ??= {});
    thinkingConfig.includeThoughts = reasoning.enabled ? !reasoning.exclude : false;

    delete unknown["reasoning"];

    return params;
  },
};

// https://ai.google.dev/gemini-api/docs/caching
// FUTURE: auto-create cached_content for message-level cache_control blocks
export const geminiPromptCachingMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    // If cached_content options exist, just pass through
    if (unknown["cached_content"]) return params;

    const promptCacheKey = unknown[
      "prompt_cache_key"
    ] as OpenAIChatLanguageModelOptions["promptCacheKey"];
    if (promptCacheKey) {
      ((params.providerOptions!["google"] ??= {}) as GoogleLanguageModelOptions).cachedContent =
        promptCacheKey;
    }

    delete unknown["cached_content"];
    return params;
  },
};

modelMiddlewareMatcher.useForModel("google/gemini-*embedding-*", {
  embedding: [geminiDimensionsMiddleware],
});

modelMiddlewareMatcher.useForModel(["google/gemini-2*", "google/gemini-3*"], {
  language: [geminiReasoningMiddleware, geminiPromptCachingMiddleware],
});
