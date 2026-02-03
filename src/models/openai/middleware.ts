import type { EmbeddingModelMiddleware, LanguageModelMiddleware } from "ai";

import type { ChatCompletionsReasoningConfig } from "../../endpoints/chat-completions/schema";

import { modelMiddlewareMatcher } from "../../middleware/matcher";

// Convert `dimensions` (OpenAI) to `dimensions` (OpenAI)
export const openAIDimensionsMiddleware: EmbeddingModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    let dimensions = unknown["dimensions"] as number;
    if (!dimensions) dimensions = 1024;

    (params.providerOptions!["openai"] ??= {})["dimensions"] = dimensions;
    delete unknown["dimensions"];

    return params;
  },
};

export const openAIReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const reasoning = unknown["reasoning"] as ChatCompletionsReasoningConfig;
    if (!reasoning) return params;

    const target = (params.providerOptions!["openai"] ??= {});

    if (!reasoning.enabled) {
      target["reasoningEffort"] = "none";
    } else if (reasoning.effort) {
      target["reasoningEffort"] = reasoning.effort;
    }
    // FUTURE: Issue warning that reasoning.max_tokens was ignored

    delete unknown["reasoning"];

    return params;
  },
};

modelMiddlewareMatcher.useForModel("openai/text-embedding-*", {
  embedding: openAIDimensionsMiddleware,
});

modelMiddlewareMatcher.useForModel("openai/gpt-*", {
  language: openAIReasoningMiddleware,
});
