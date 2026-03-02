import type { EmbeddingModelMiddleware, LanguageModelMiddleware } from "ai";

import { logger } from "../logger";

export const debugFinalParamsMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params, model }) => {
    logger.trace(
      {
        kind: "text",
        modelId: model.modelId,
        providerId: model.provider,
        params,
      },
      "[middleware] final params",
    );
    return params;
  },
};

export const debugEmbeddingFinalParamsMiddleware: EmbeddingModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params, model }) => {
    logger.trace(
      {
        kind: "embedding",
        modelId: model.modelId,
        providerId: model.provider,
        params,
      },
      "[middleware] final params",
    );
    return params;
  },
};
