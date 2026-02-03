import type { ModelCatalog, CatalogModel } from "../../models/types";
import type { ModelList, Model } from "./schema";

import { mergeResponseInit } from "../../utils/response";

export function toModel(id: string, catalogModel: CatalogModel): Model {
  const { created, providers, modalities, additionalProperties, ...rest } = catalogModel;
  let createdTimestamp = Math.floor(Date.now() / 1000);
  if (created) {
    const parsed = Date.parse(created);
    if (!isNaN(parsed)) {
      createdTimestamp = Math.floor(parsed / 1000);
    }
  }

  const model = {
    id,
    object: "model" as const,
    created: createdTimestamp,
    owned_by: id.split("/")[0] || "system",
    architecture: {
      input_modalities: modalities?.input || [],
      modality:
        modalities?.input &&
        modalities?.output &&
        `${modalities.input?.[0]}->${modalities.output?.[0]}`,
      output_modalities: modalities?.output || [],
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
export function createModelsResponse(models: ModelCatalog, responseInit?: ResponseInit): Response {
  return new Response(
    JSON.stringify(toModels(models)),
    mergeResponseInit({ "Content-Type": "application/json" }, responseInit),
  );
}

export function createModelResponse(
  id: string,
  catalogModel: CatalogModel,
  responseInit?: ResponseInit,
): Response {
  return new Response(
    JSON.stringify(toModel(id, catalogModel)),
    mergeResponseInit({ "Content-Type": "application/json" }, responseInit),
  );
}
