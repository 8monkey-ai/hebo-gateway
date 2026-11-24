import type { GoogleLanguageModelOptions } from "@ai-sdk/google";
import type { GoogleVertexEmbeddingModelOptions } from "@ai-sdk/google-vertex";
import type { OpenAIChatLanguageModelOptions } from "@ai-sdk/openai";
import type { EmbeddingModelMiddleware, LanguageModelMiddleware } from "ai";

import type { EmbeddingsDimensions } from "../../endpoints/embeddings/index.ts";
import { modelMiddlewareMatcher } from "../../middleware/matcher.ts";
import {
  nearestEffort,
  reasoningControls,
  resolveReasoning,
  takeReasoning,
} from "../../middleware/reasoning.ts";
import {
  type TranscriptionModelMiddleware,
  wordSegmentsMiddleware,
} from "../../middleware/transcription.ts";
import { specOf } from "../../providers/registry.ts";
import type { ReasoningControls } from "../types.ts";

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

// Current generation, assumed for models without reasoning data (e.g. custom ones).
const GEMINI: ReasoningControls = { effort: ["low", "medium", "high"] };

// Thinking levels come from the model spec (models.dev): a level the model does not list is
// rejected, so the nearest one is sent. Off maps to the lowest one: thinking can't be turned
// off through levels.
// https://ai.google.dev/gemini-api/docs/thinking#thinking-levels
type ThinkingLevel = NonNullable<GoogleLanguageModelOptions["thinkingConfig"]>["thinkingLevel"];

export const geminiReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params, model }) => {
    const spec = specOf(model);
    const controls = reasoningControls(spec, GEMINI);
    // If thinking options exist, just pass through
    if (params.providerOptions?.["unknown"]?.["thinking_config"]) return params;

    const reasoning = takeReasoning(params);
    if (!reasoning || !controls) return params;

    const target = (params.providerOptions!["google"] ??= {}) as GoogleLanguageModelOptions;
    const effort = resolveReasoning(reasoning, controls)?.effort;
    const thinkingConfig = (target.thinkingConfig ??= {});
    if (effort) {
      thinkingConfig.thinkingLevel = (
        effort === "none" ? nearestEffort(effort, controls.effort!) : effort
      ) as ThinkingLevel;
    }
    // FUTURE: warn that max_tokens (unsupported) was ignored
    thinkingConfig.includeThoughts = reasoning.enabled ? !reasoning.exclude : false;

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

modelMiddlewareMatcher.useForModel("google/gemini-*", {
  language: [geminiReasoningMiddleware],
});

// Explicit `cachedContent` is Gemini 3 only: later generations cache implicitly.
modelMiddlewareMatcher.useForModel("google/gemini-3*", {
  language: [geminiPromptCachingMiddleware],
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
