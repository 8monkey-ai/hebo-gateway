import type { CohereEmbeddingModelOptions, CohereLanguageModelOptions } from "@ai-sdk/cohere";
import type { EmbeddingModelMiddleware, LanguageModelMiddleware } from "ai";

import type { EmbeddingsDimensions } from "../../endpoints/embeddings/index.ts";
import { modelMiddlewareMatcher } from "../../middleware/matcher.ts";
import { reasoningControls, resolveReasoning, takeReasoning } from "../../middleware/reasoning.ts";
import { specOf } from "../../providers/registry.ts";
import type { ReasoningControls } from "../types.ts";

// Convert `dimensions` (OpenAI) to `outputDimension` (Cohere)
export const cohereDimensionsMiddleware: EmbeddingModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const dimensions = unknown["dimensions"] as EmbeddingsDimensions;
    if (!dimensions) return params;

    const target = (params.providerOptions!["cohere"] ??= {}) as CohereEmbeddingModelOptions;

    // @ts-expect-error AI SDK does the value checking for us
    target.outputDimension = dimensions;

    delete unknown["dimensions"];

    return params;
  },
};

// Assumed for models without reasoning data (e.g. custom ones).
const COMMAND: ReasoningControls = { toggle: true, budget: {} };

// Cohere takes a thinking toggle, with a token budget on the models that list one (models.dev).
export const cohereReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params, model }) => {
    const spec = specOf(model);
    const controls = reasoningControls(spec, COMMAND);
    const reasoning = takeReasoning(params);
    if (!reasoning || !controls) return params;

    const resolved = resolveReasoning(reasoning, controls, params.maxOutputTokens ?? spec.output);
    if (!resolved) return params;

    const target = (params.providerOptions!["cohere"] ??= {}) as CohereLanguageModelOptions;
    target.thinking = resolved.enabled
      ? resolved.budget === undefined
        ? { type: "enabled" }
        : { type: "enabled", tokenBudget: resolved.budget }
      : { type: "disabled" };

    return params;
  },
};

modelMiddlewareMatcher.useForModel("cohere/embed-*", { embedding: [cohereDimensionsMiddleware] });

modelMiddlewareMatcher.useForModel("cohere/*", { language: [cohereReasoningMiddleware] });
