import type { EmbeddingModelMiddleware } from "ai";

import { modelMiddlewareMatcher } from "../../model-middleware";

// Convert `dimensions` (OpenAI) to `output_dimension` (Cohere)
export const voyageEmbeddingModelMiddleware: EmbeddingModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unhandled = params.providerOptions?.["unhandled"];
    if (!unhandled) return params;

    const { dimensions, ...rest } = unhandled;
    if (dimensions === null || dimensions === undefined) return params;

    if (![256, 384, 512, 1024, 1536].includes(dimensions as number)) {
      throw new Error("Cohere embeddings only support dimensions of 256, 384, 512, 1024, or 1536.");
    }

    return {
      ...params,
      providerOptions: {
        ...params.providerOptions,
        unhandled: {
          ...rest,
          output_dimension: dimensions,
        },
      },
    };
  },
};

modelMiddlewareMatcher.useForModel("cohere/embed-*", { embedding: voyageEmbeddingModelMiddleware });
