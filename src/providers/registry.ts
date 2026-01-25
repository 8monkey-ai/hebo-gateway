import type { ProviderRegistryProvider } from "ai";

import { customProvider } from "ai";

import type { ModelCatalog, ModelId } from "../models/types";

export const resolveProvider = (
  providers: ProviderRegistryProvider,
  models: ModelCatalog,
  modelId: string,
  modality: "text" | "image" | "audio" | "video" | "embeddings",
) => {
  const catalogModel = models[modelId as ModelId];

  if (!catalogModel) {
    throw new Error(`Model '${modelId}' not found in catalog`);
  }

  if (modality && !catalogModel.modalities.output.includes(modality)) {
    throw new Error(`Model '${modelId}' does not support '${modality}' output`);
  }

  const resolvedProvider = catalogModel.providers[0];

  if (!resolvedProvider) {
    throw new Error(`No providers configured for model '${modelId}'`);
  }

  switch (modality) {
    case "text":
      return customProvider({
        languageModels: {
          [modelId]: providers.languageModel(`${resolvedProvider}:${modelId}`),
        },
      });
    case "embeddings":
      return customProvider({
        embeddingModels: {
          [modelId]: providers.embeddingModel(`${resolvedProvider}:${modelId}`),
        },
      });
    default:
      throw new Error(`Modality '${modality}' is not yet supported`);
  }
};
