import type { OpenAIChatLanguageModelOptions, OpenAIEmbeddingModelOptions } from "@ai-sdk/openai";
import type { EmbeddingModelMiddleware, LanguageModelMiddleware } from "ai";

import { defineSpecMiddleware, modelMiddlewareMatcher } from "../../middleware/matcher.ts";
import { reasoningControls, resolveReasoning, takeReasoning } from "../../middleware/reasoning.ts";
import type { TranscriptionModelMiddleware } from "../../middleware/transcription.ts";
import { type ReasoningControls, REASONING_EFFORTS } from "../types.ts";

// Convert `dimensions` (OpenAI) to `dimensions` (OpenAI)
export const openAIDimensionsMiddleware: EmbeddingModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const dimensions = unknown["dimensions"] as OpenAIEmbeddingModelOptions["dimensions"];
    if (!dimensions) return params;

    const target = (params.providerOptions!["openai"] ??= {}) as OpenAIEmbeddingModelOptions;
    target.dimensions = dimensions;
    delete unknown["dimensions"];

    return params;
  },
};

// Takes any effort, for models without reasoning data (e.g. custom ones).
const GPT: ReasoningControls = { effort: REASONING_EFFORTS };

// Effort levels come from the model spec (models.dev): sending one a model does not list only
// earns a warning and a silently dropped field, so it is narrowed to the nearest one here.
export const openAIReasoningMiddleware = defineSpecMiddleware((spec): LanguageModelMiddleware => {
  const controls = reasoningControls(spec, GPT);
  return {
    specificationVersion: "v3",
    // oxlint-disable-next-line require-await
    transformParams: async ({ params }) => {
      const reasoning = takeReasoning(params);
      if (!reasoning || !controls) return params;

      // FUTURE: warn that reasoning.max_tokens (not supported) was ignored
      const effort = resolveReasoning(reasoning, controls)?.effort;
      if (effort) {
        (
          (params.providerOptions!["openai"] ??= {}) as OpenAIChatLanguageModelOptions
        ).reasoningEffort = effort as OpenAIChatLanguageModelOptions["reasoningEffort"];
      }

      return params;
    },
  };
});

// https://developers.openai.com/api/docs/guides/prompt-caching/
export const openAIPromptCachingMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const key = unknown["prompt_cache_key"] as OpenAIChatLanguageModelOptions["promptCacheKey"];
    const retention = unknown[
      "prompt_cache_retention"
    ] as OpenAIChatLanguageModelOptions["promptCacheRetention"];

    if (key || retention) {
      const target = (params.providerOptions!["openai"] ??= {}) as OpenAIChatLanguageModelOptions;
      if (key) target.promptCacheKey = key;
      if (retention) target.promptCacheRetention = retention;
    }

    delete unknown["prompt_cache_key"];
    delete unknown["prompt_cache_retention"];

    return params;
  },
};

modelMiddlewareMatcher.useForModel("openai/text-embedding-*", {
  embedding: [openAIDimensionsMiddleware],
});

modelMiddlewareMatcher.useForModel("openai/*", {
  language: [openAIReasoningMiddleware, openAIPromptCachingMiddleware],
});

// GPT Transcribe only returns `json`. Without these, the AI SDK sends `verbose_json` and
// `timestamp_granularities[]=segment` as soon as any OpenAI option is set.
// Explicit `timestamp_granularities` are forwarded as-is for upstream to validate.
// FUTURE: Remove this middleware when the SDK stops adding unsupported defaults:
// https://github.com/vercel/ai/issues/23495
export const openAITranscribeMiddleware: TranscriptionModelMiddleware = {
  transformParams: ({ params }) => {
    const unknown = ((params.providerOptions ??= {})["unknown"] ??= {});

    unknown["response_format"] = "json";
    unknown["timestamp_granularities"] ??= [];

    return params;
  },
};

modelMiddlewareMatcher.useForModel("openai/gpt-transcribe*", {
  transcription: [openAITranscribeMiddleware],
});
