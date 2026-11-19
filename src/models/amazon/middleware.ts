import type {
  AmazonBedrockEmbeddingModelOptions,
  AmazonBedrockLanguageModelOptions,
} from "@ai-sdk/amazon-bedrock";
import type { EmbeddingModelMiddleware, LanguageModelMiddleware } from "ai";

import type { EmbeddingsDimensions } from "../../endpoints/embeddings/schema.ts";
import { defineSpecMiddleware, modelMiddlewareMatcher } from "../../middleware/matcher.ts";
import { reasoningControls, resolveReasoning, takeReasoning } from "../../middleware/reasoning.ts";
import type { ReasoningControls } from "../types.ts";

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

// Current generation, assumed for models without reasoning data (e.g. custom ones).
const NOVA: ReasoningControls = { toggle: true, effort: ["low", "medium", "high"] };

// Nova takes a reasoning toggle and a maximum effort. What each model takes comes from its
// spec (models.dev).
export const novaReasoningMiddleware = defineSpecMiddleware((spec): LanguageModelMiddleware => {
  const controls = reasoningControls(spec, NOVA);
  return {
    specificationVersion: "v3",
    // oxlint-disable-next-line require-await
    transformParams: async ({ params }) => {
      const reasoning = takeReasoning(params);
      if (!reasoning || !controls) return params;

      const resolved = resolveReasoning(reasoning, controls);
      if (!resolved) return params;

      // FUTURE: warn if reasoning.max_tokens (unsupported) was ignored
      const target = (params.providerOptions!["amazon"] ??=
        {}) as AmazonBedrockLanguageModelOptions;
      target.reasoningConfig = resolved.enabled
        ? {
            type: "enabled",
            maxReasoningEffort: resolved.effort as "low" | "medium" | "high" | undefined,
          }
        : { type: "disabled" };

      return params;
    },
  };
});

modelMiddlewareMatcher.useForModel("amazon/nova-*embeddings*", {
  embedding: [novaDimensionsMiddleware],
});

modelMiddlewareMatcher.useForModel("amazon/nova-*", {
  language: [novaReasoningMiddleware],
});
