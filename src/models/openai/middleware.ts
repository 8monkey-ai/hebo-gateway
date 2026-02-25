import type { EmbeddingModelMiddleware, LanguageModelMiddleware } from "ai";

import type {
  ChatCompletionsReasoningConfig,
  ChatCompletionsReasoningEffort,
} from "../../endpoints/chat-completions/schema";

import { modelMiddlewareMatcher } from "../../middleware/matcher";

// Convert `dimensions` (OpenAI) to `dimensions` (OpenAI)
export const openAIDimensionsMiddleware: EmbeddingModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const dimensions = unknown["dimensions"] as number;
    if (!dimensions) return params;

    (params.providerOptions!["openai"] ??= {})["dimensions"] = dimensions;
    delete unknown["dimensions"];

    return params;
  },
};

function mapGptOssReasoningEffort(
  effort?: ChatCompletionsReasoningEffort,
): "low" | "medium" | "high" {
  switch (effort) {
    case "medium":
      return "medium";
    case "high":
    case "xhigh":
    case "max":
      return "high";
    default:
      return "low";
  }
}

export const openAIReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params, model }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const reasoning = unknown["reasoning"] as ChatCompletionsReasoningConfig;
    if (!reasoning) return params;

    const target = (params.providerOptions!["openai"] ??= {});
    const isGptOss = model.modelId.includes("gpt-oss");

    if (isGptOss) {
      // FUTURE: warn that unable to disable reasoning for gpt-oss models
      target["reasoningEffort"] = mapGptOssReasoningEffort(reasoning.effort);
    } else if (reasoning.enabled === false) {
      target["reasoningEffort"] = "none";
    } else if (reasoning.effort) {
      target["reasoningEffort"] = reasoning.effort;
    }

    // FUTURE: warn that reasoning.max_tokens (not supported) was ignored

    delete unknown["reasoning"];

    return params;
  },
};

// https://ai.google.dev/gemini-api/docs/caching
export const openAIPromptCachingMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const key = unknown["prompt_cache_key"] as string | undefined;
    const retention = unknown["prompt_cache_retention"] as "in_memory" | "24h" | undefined;

    if (key || retention) {
      const target = (params.providerOptions!["openai"] ??= {});
      if (key) target["promptCacheKey"] = key;
      if (retention) target["promptCacheRetention"] = retention;
    }

    delete unknown["prompt_cache_key"];
    delete unknown["prompt_cache_retention"];

    return params;
  },
};

modelMiddlewareMatcher.useForModel("openai/text-embedding-*", {
  embedding: [openAIDimensionsMiddleware],
});

modelMiddlewareMatcher.useForModel("openai/gpt-*", {
  language: [openAIReasoningMiddleware, openAIPromptCachingMiddleware],
});
