import type { EmbeddingModelMiddleware, LanguageModelMiddleware } from "ai";

import type {
  ChatCompletionsReasoningConfig,
  ChatCompletionsReasoningEffort,
} from "../../endpoints/chat-completions/schema";

import { modelMiddlewareMatcher } from "../../middleware/matcher";

// Convert `dimensions` (OpenAI) to `embeddingDimension` (Nova)
export const novaDimensionsMiddleware: EmbeddingModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const dimensions = unknown["dimensions"] as number;
    if (!dimensions) return params;

    (params.providerOptions!["nova"] ??= {})["embeddingDimension"] = dimensions;
    delete unknown["dimensions"];

    return params;
  },
};

function mapNovaEffort(effort: ChatCompletionsReasoningEffort) {
  switch (effort) {
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

export const novaReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const reasoning = unknown["reasoning"] as ChatCompletionsReasoningConfig;
    if (!reasoning) return params;

    const target = (params.providerOptions!["amazon"] ??= {});

    if (!reasoning.enabled) {
      target["reasoningConfig"] = { type: "disabled" };
    } else if (reasoning.effort) {
      // FUTURE: warn if mapNovaEffort modified the effort
      target["reasoningConfig"] = {
        type: "enabled",
        maxReasoningEffort: mapNovaEffort(reasoning.effort),
      };
    } else {
      // FUTURE: warn if reasoning.max_tokens (unsupported) was ignored
      target["reasoningConfig"] = { type: "enabled" };
    }

    delete unknown["reasoning"];

    return params;
  },
};

modelMiddlewareMatcher.useForModel("amazon/nova-*embeddings*", {
  embedding: [novaDimensionsMiddleware],
});

modelMiddlewareMatcher.useForModel("amazon/nova-2-*", {
  language: [novaReasoningMiddleware],
});
