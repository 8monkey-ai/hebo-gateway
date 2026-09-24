import type { OpenAIChatLanguageModelOptions, OpenAIEmbeddingModelOptions } from "@ai-sdk/openai";
import type { EmbeddingModelMiddleware, LanguageModelMiddleware } from "ai";

import type {
  ChatCompletionsReasoningConfig,
  ChatCompletionsReasoningEffort,
} from "../../endpoints/chat-completions/schema";
import { modelMiddlewareMatcher } from "../../middleware/matcher";

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

function mapGptOssReasoningEffort(
  effort?: ChatCompletionsReasoningEffort,
): "low" | "medium" | "high" | undefined {
  switch (effort) {
    case undefined:
    case "none":
      return undefined;
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

  return undefined;
}

/**
 * Drops any provider namespace, so the canonical `openai/gpt-6-sol` and the Bedrock Mantle
 * `openai.gpt-6-astra` both read the same as a resolved model's native `gpt-6-sol`.
 */
const bareModelId = (modelId: string) => {
  const start = modelId.indexOf("gpt-");
  return start === -1 ? modelId : modelId.slice(start);
};

/** GPT-6 is the first generation to take `max`, and the first to drop `minimal`. */
const isGpt6OrLater = (modelId: string) => {
  const version = bareModelId(modelId).slice("gpt-".length);
  // `6-sol` -> 6, `5.1` -> 5, `oss-120b` -> NaN, which is never `>= 6`.
  return Number(version.split("-")[0]?.split(".")[0]) >= 6;
};

/** Only Sol and Luna can turn reasoning off; the rest of the GPT-6 line has no `none`. */
const supportsNoneEffort = (modelId: string) => {
  if (!isGpt6OrLater(modelId)) return true;

  const bare = bareModelId(modelId);
  return bare === "gpt-6-sol" || bare === "gpt-6-luna";
};

/**
 * GPT-6 takes `max` as its own level above `xhigh`, and drops `minimal` — earlier models are
 * the other way round. Sending an effort a model does not list only earns a warning and a
 * silently dropped field, so narrow it here instead.
 */
function mapReasoningEffort(
  effort: ChatCompletionsReasoningEffort,
  modelId: string,
): OpenAIChatLanguageModelOptions["reasoningEffort"] {
  if (!isGpt6OrLater(modelId)) {
    // `max` is GPT-6 and later only, so it tops out at `xhigh` here.
    return effort === "max" ? "xhigh" : effort;
  }

  switch (effort) {
    case "none":
      return supportsNoneEffort(modelId) ? "none" : "low";
    // Not a GPT-6 level; `low` is the closest it offers.
    case "minimal":
      return "low";
    case "low":
    case "medium":
    case "high":
    case "xhigh":
    case "max":
      return effort;
  }

  return undefined;
}

export const openAIReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params, model }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const reasoning = unknown["reasoning"] as ChatCompletionsReasoningConfig;
    if (!reasoning) return params;

    const target = (params.providerOptions!["openai"] ??= {}) as OpenAIChatLanguageModelOptions;
    const isGptOss = model.modelId.includes("gpt-oss");

    if (isGptOss) {
      // FUTURE: warn that unable to disable reasoning for gpt-oss models
      target.reasoningEffort = mapGptOssReasoningEffort(reasoning.effort);
    } else if (reasoning.enabled === false) {
      // FUTURE: warn that reasoning cannot be disabled outside of GPT-6 Sol and Luna
      target.reasoningEffort = supportsNoneEffort(model.modelId) ? "none" : "low";
    } else if (reasoning.effort) {
      target.reasoningEffort = mapReasoningEffort(reasoning.effort, model.modelId);
    }

    // FUTURE: warn that reasoning.max_tokens (not supported) was ignored

    delete unknown["reasoning"];

    return params;
  },
};

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

modelMiddlewareMatcher.useForModel("openai/gpt-*", {
  language: [openAIReasoningMiddleware, openAIPromptCachingMiddleware],
});
