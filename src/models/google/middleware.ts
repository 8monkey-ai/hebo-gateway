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
import type { TranscriptionModelMiddleware } from "../../middleware/transcription";
import { rejectUnsupportedParams } from "../../middleware/utils";

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

/**
 * Flash dropped the `minimal` thinking level after 3.6 (3.7 onwards starts at `low`), and
 * sending a level a model does not list is rejected, so it collapses to `low` there.
 */
const supportsMinimalLevel = (modelId: string) => {
  const start = modelId.indexOf("gemini-");
  if (start === -1) return true;

  const rest = modelId.slice(start + "gemini-".length);
  const end = rest.indexOf("-");
  // `3.8-flash` -> 3.8, `3-flash-preview` -> 3, a missing version -> NaN, never `>= 3.7`.
  return !(Number(end === -1 ? rest : rest.slice(0, end)) >= 3.7);
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
      case "max":
        return "high";
    }
  }

  // Flash
  switch (effort) {
    case "none":
    case "minimal":
      return supportsMinimalLevel(modelId) ? "minimal" : "low";
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "high":
    case "xhigh":
    case "max":
      return "high";
  }

  return undefined;
}

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

    if (reasoning.effort) {
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

modelMiddlewareMatcher.useForModel("google/gemini-3*", {
  language: [geminiReasoningMiddleware, geminiPromptCachingMiddleware],
});

// Maps the OpenAI transcription params to Gemini Transcribe options.
export const geminiTranscribeMiddleware: TranscriptionModelMiddleware = {
  transformParams: ({ params, model }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    rejectUnsupportedParams(unknown, ["prompt", "temperature"], `model '${model.modelId}'`);

    const language = unknown["language"];
    if (language !== undefined) {
      unknown["language_codes"] = [language];
      delete unknown["language"];
    }

    const granularities = unknown["timestamp_granularities"] as string[] | undefined;
    if (granularities !== undefined) {
      if (granularities.includes("word")) unknown["word_timestamp"] = true;
      delete unknown["timestamp_granularities"];
    }

    return params;
  },
};

modelMiddlewareMatcher.useForModel("google/gemini-*-transcribe*", {
  transcription: [geminiTranscribeMiddleware],
});
