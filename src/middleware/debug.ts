import type { EmbeddingModelMiddleware, LanguageModelMiddleware } from "ai";

import { logger } from "../logger";
import type { TranscriptionModelMiddleware } from "./transcription";

export const debugFinalParamsMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // oxlint-disable-next-line require-await
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
  // oxlint-disable-next-line require-await
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

// Audio is logged by size only. Redaction is deferred to serialization (`toJSON`),
// so nothing is copied when trace logging is disabled.
export const debugTranscriptionFinalParamsMiddleware: TranscriptionModelMiddleware = {
  transformParams: ({ params, model }) => {
    logger.trace(
      {
        kind: "transcription",
        modelId: model.modelId,
        providerId: model.provider,
        params: {
          toJSON: () => ({
            ...params,
            audio:
              typeof params.audio === "string"
                ? `[${params.audio.length} base64 chars]`
                : `[${params.audio.byteLength} bytes]`,
          }),
        },
      },
      "[middleware] final params",
    );
    return params;
  },
};
