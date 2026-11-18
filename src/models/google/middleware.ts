import type { GoogleLanguageModelOptions } from "@ai-sdk/google";
import type { GoogleVertexEmbeddingModelOptions } from "@ai-sdk/google-vertex";
import type { OpenAIChatLanguageModelOptions } from "@ai-sdk/openai";
import type { EmbeddingModelMiddleware, LanguageModelMiddleware } from "ai";

import type {
  ChatCompletionsReasoningConfig,
  ChatCompletionsReasoningEffort,
} from "../../endpoints/chat-completions/schema.ts";
import type { EmbeddingsDimensions } from "../../endpoints/embeddings/index.ts";
import { modelMiddlewareMatcher } from "../../middleware/matcher.ts";
import {
  type TranscriptionModelMiddleware,
  wordSegmentsMiddleware,
} from "../../middleware/transcription.ts";

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

/** `3.8-flash` -> 3.8, `3-flash-preview` -> 3, `4-argon` -> 4, a missing version -> NaN. */
const geminiVersion = (modelId: string) => {
  const start = modelId.indexOf("gemini-");
  if (start === -1) return Number.NaN;

  const rest = modelId.slice(start + "gemini-".length);
  const end = rest.indexOf("-");
  return Number(end === -1 ? rest : rest.slice(0, end));
};

// https://ai.google.dev/gemini-api/docs/thinking#thinking-levels
export function mapGeminiReasoningEffort(
  effort: ChatCompletionsReasoningEffort,
  modelId: string,
): "minimal" | "low" | "medium" | "high" | "xhigh" | undefined {
  const version = geminiVersion(modelId);

  // Gemini 4 always thinks and rejects `minimal` with a 400; only Hydrogen lists `xhigh`.
  if (version >= 4) {
    switch (effort) {
      case "none":
      case "minimal":
      case "low":
        return "low";
      case "medium":
        return "medium";
      case "high":
        return "high";
      case "xhigh":
      case "max":
        return modelId.includes("hydrogen") ? "xhigh" : "high";
    }
  }

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

  // Flash dropped the `minimal` thinking level after 3.6 (3.7 onwards starts at `low`), and
  // sending a level a model does not list is rejected, so it collapses to `low` there.
  switch (effort) {
    case "none":
    case "minimal":
      return version >= 3.7 ? "low" : "minimal";
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
      // Gemini 4 rejects `thinkingBudget` with a 400, so `none` maps to its lowest level.
      if (reasoning.effort === "none" && !(geminiVersion(modelId) >= 4)) {
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

// Gemini 4 supports implicit caching only; explicit `cachedContent` is not supported.
modelMiddlewareMatcher.useForModel("google/gemini-4*", {
  language: [geminiReasoningMiddleware],
});

// Maps the OpenAI transcription params to Gemini Transcribe options.
export const geminiTranscribeMiddleware: TranscriptionModelMiddleware = {
  transformParams: ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const language = unknown["language"];
    if (language !== undefined) {
      unknown["language_codes"] = [language];
      delete unknown["language"];
    }

    // FUTURE: Use shared SDK timing options instead: https://github.com/vercel/ai/issues/23486
    const granularities = unknown["timestamp_granularities"] as string[] | undefined;
    if (granularities !== undefined) {
      if (granularities.includes("word")) unknown["word_timestamp"] = true;
      delete unknown["timestamp_granularities"];
    }

    return params;
  },
};

modelMiddlewareMatcher.useForModel("google/gemini-*-transcribe*", {
  // Gemini Transcribe returns word timings only, which the AI SDK exposes as `segments`.
  transcription: [geminiTranscribeMiddleware, wordSegmentsMiddleware],
});
