import type {
  AmazonBedrockEmbeddingModelOptions,
  AmazonBedrockLanguageModelOptions,
} from "@ai-sdk/amazon-bedrock";
import type { EmbeddingModelMiddleware, LanguageModelMiddleware } from "ai";

import type {
  ChatCompletionsReasoningConfig,
  ChatCompletionsReasoningEffort,
} from "../../endpoints/chat-completions/schema";
import type { EmbeddingsDimensions } from "../../endpoints/embeddings/schema";
import { modelMiddlewareMatcher } from "../../middleware/matcher";

// Convert `dimensions` (OpenAI) to `embeddingDimension` (Nova)
export const novaDimensionsMiddleware: EmbeddingModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const dimensions = unknown["dimensions"] as EmbeddingsDimensions;
    if (!dimensions) return params;

    const target = (params.providerOptions!["nova"] ??= {}) as AmazonBedrockEmbeddingModelOptions;

    // @ts-expect-error AI SDK does the value checking for us
    target.embeddingDimension = dimensions;

    delete unknown["dimensions"];

    return params;
  },
};

function mapNovaEffort(
  effort: ChatCompletionsReasoningEffort,
): "low" | "medium" | "high" | undefined {
  switch (effort) {
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

export const novaReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const reasoning = unknown["reasoning"] as ChatCompletionsReasoningConfig;
    if (!reasoning) return params;

    const target = (params.providerOptions!["amazon"] ??= {}) as AmazonBedrockLanguageModelOptions;

    if (!reasoning.enabled) {
      target.reasoningConfig = { type: "disabled" };
    } else if (reasoning.effort) {
      // FUTURE: warn if mapNovaEffort modified the effort
      target.reasoningConfig = {
        type: "enabled",
        maxReasoningEffort: mapNovaEffort(reasoning.effort),
      };
    } else {
      // FUTURE: warn if reasoning.max_tokens (unsupported) was ignored
      target.reasoningConfig = { type: "enabled" };
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
