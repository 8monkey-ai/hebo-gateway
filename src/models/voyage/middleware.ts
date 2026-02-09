import type { EmbeddingModelMiddleware } from "ai";

import { modelMiddlewareMatcher } from "../../middleware/matcher";

// Convert `dimensions` (OpenAI) to `outputDimension` (Voyage)
export const voyageDimensionsMiddleware: EmbeddingModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const dimensions = unknown["dimensions"] as number;
    if (!dimensions) return params;

    (params.providerOptions!["voyage"] ??= {})["outputDimension"] = dimensions;
    delete unknown["dimensions"];

    return params;
  },
};

modelMiddlewareMatcher.useForModel("voyage/*", { embedding: [voyageDimensionsMiddleware] });
