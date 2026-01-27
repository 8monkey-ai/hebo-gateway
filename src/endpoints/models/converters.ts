import type { ModelCatalog, CatalogModel } from "../../models/types";
import type { ModelList, Model } from "./schema";

export function toModel(id: string, catalogModel: CatalogModel): Model {
  const { created, providers, modalities, additionalProperties, ...rest } = catalogModel;
  let createdTimestamp = Math.floor(Date.now() / 1000);
  if (created) {
    const parsed = Date.parse(created);
    if (!isNaN(parsed)) {
      createdTimestamp = Math.floor(parsed / 1000);
    }
  }

  const model: Model = {
    id,
    object: "model",
    created: createdTimestamp,
    owned_by: providers?.[0] || "system",
    architecture: {
      input_modalities: modalities.input || [],
      modality:
        modalities.input &&
        modalities.output &&
        `${modalities.input?.[0]}->${modalities.output?.[0]}`,
      output_modalities: modalities.output || [],
    },
    endpoints:
      providers?.map((provider) => ({
        tag: provider,
      })) || [],
    ...rest,
    ...additionalProperties,
  };

  return model;
}

export function toModels(models: ModelCatalog): ModelList {
  return {
    object: "list",
    data: Object.entries(models).map(([id, catalogModel]) => toModel(id, catalogModel!)),
  };
}
export function createModelsResponse(models: ModelCatalog): Response {
  return new Response(JSON.stringify(toModels(models)), {
    headers: { "Content-Type": "application/json" },
  });
}

export function createModelResponse(id: string, catalogModel: CatalogModel): Response {
  return new Response(JSON.stringify(toModel(id, catalogModel)), {
    headers: { "Content-Type": "application/json" },
  });
}
