import type { EmbeddingModelV3, ProviderV3 } from "@ai-sdk/provider";

import { customProvider } from "ai";

import type { CanonicalModelId } from "../models/types";

export const createNormalizedVoyage = (voyage: ProviderV3) => {
  return customProvider({
    embeddingModels: {
      "voyage/voyage-4-lite": voyage.textEmbeddingModel("voyage-4-lite"),
    } satisfies Partial<Record<CanonicalModelId, EmbeddingModelV3>>,
  });
};
