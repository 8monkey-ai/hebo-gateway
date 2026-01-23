import type { ProviderV3 } from "@ai-sdk/provider";

import { customProvider } from "ai";

export const createNormalizedVoyage = (voyage: ProviderV3) => {
  return customProvider({
    embeddingModels: {
      "voyage/voyage-3.5-lite": voyage.textEmbeddingModel("voyage-3.5-lite"),
    },
  });
};
