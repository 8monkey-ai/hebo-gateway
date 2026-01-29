import type { EmbeddingModelMiddleware } from "ai";

import { modelMiddlewareMatcher } from "../../model-middleware";

// Convert `dimensions` (OpenAI) to `outputDimension` (Voyage)
export const voyageEmbeddingModelMiddleware: EmbeddingModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unhandled = params.providerOptions?.["unhandled"];
    if (!unhandled) return params;

    const { dimensions, ...rest } = unhandled;
    if (dimensions === null || dimensions === undefined) return params;

    if (![256, 512, 1024, 1536, 2048].includes(dimensions as number)) {
      throw new Error(
        "Voyage embeddings only support dimensions of 256, 512, 1024, 1536, or 2048.",
      );
    }

    return {
      ...params,
      providerOptions: {
        ...params.providerOptions,
        unhandled: {
          ...rest,
          outputDimension: dimensions,
        },
      },
    };
  },
};

modelMiddlewareMatcher.useForModel("voyage/*", { embedding: voyageEmbeddingModelMiddleware });
