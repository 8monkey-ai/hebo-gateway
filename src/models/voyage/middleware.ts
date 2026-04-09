import type { EmbeddingModelMiddleware } from "ai";
import type { VoyageEmbeddingOptions } from "voyage-ai-provider";

import type { EmbeddingsDimensions } from "../../endpoints/embeddings";
import { modelMiddlewareMatcher } from "../../middleware/matcher";

// Convert `dimensions` (OpenAI) to `outputDimension` (Voyage)
export const voyageDimensionsMiddleware: EmbeddingModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const dimensions = unknown["dimensions"] as EmbeddingsDimensions;
    if (!dimensions) return params;

    const target = (params.providerOptions!["voyage"] ??= {}) as VoyageEmbeddingOptions;
    target.outputDimension = dimensions;
    delete unknown["dimensions"];

    return params;
  },
};

modelMiddlewareMatcher.useForModel("voyage/*", { embedding: [voyageDimensionsMiddleware] });
