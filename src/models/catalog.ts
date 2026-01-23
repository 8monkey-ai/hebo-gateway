import type { ModelCatalog } from "./types";

export function createModelCatalog(...entries: ModelCatalog[]): ModelCatalog {
  return Object.assign({}, ...entries);
}

export const resolveModelId = (
  models: ModelCatalog,
  modelId: string,
  requiredOutputModality?: "text" | "image" | "audio" | "video" | "embeddings",
): { resolvedProvider: string; resolvedModelId: string } => {
  const catalogModel = models[modelId];

  if (!catalogModel) {
    throw new Error(`Model '${modelId}' not found in catalog`);
  }

  if (catalogModel.providers.length === 0) {
    throw new Error(`No providers configured for model '${modelId}'`);
  }

  if (requiredOutputModality && !catalogModel.modalities.output.includes(requiredOutputModality)) {
    throw new Error(`Model '${modelId}' does not support '${requiredOutputModality}' output`);
  }

  const resolvedProvider = catalogModel.providers[0];
  const resolvedModelId = `${resolvedProvider}:${modelId}`;

  return { resolvedProvider, resolvedModelId };
};
