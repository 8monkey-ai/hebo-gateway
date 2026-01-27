import type { ModelCatalog, CatalogModel } from "../../models/types";
import type { OpenAICompatModelList, OpenAICompatModel } from "./schema";

export function toOpenAICompatModel(id: string, catalogModel: CatalogModel): OpenAICompatModel {
  const { created, providers, modalities, additionalProperties, ...rest } = catalogModel;
  let createdTimestamp = Math.floor(Date.now() / 1000);
  if (created) {
    const parsed = Date.parse(created);
    if (!isNaN(parsed)) {
      createdTimestamp = Math.floor(parsed / 1000);
    }
  }

  const model: OpenAICompatModel = {
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

export function toOpenAICompatModelList(
  models: ModelCatalog,
): OpenAICompatModelList<OpenAICompatModel> {
  return {
    object: "list",
    data: Object.entries(models).map(([id, catalogModel]) =>
      toOpenAICompatModel(id, catalogModel!),
    ),
  };
}
export function createOpenAICompatModelListResponse(models: ModelCatalog): Response {
  return new Response(JSON.stringify(toOpenAICompatModelList(models)), {
    headers: { "Content-Type": "application/json" },
  });
}

export function createOpenAICompatModelResponse(id: string, catalogModel: CatalogModel): Response {
  return new Response(JSON.stringify(toOpenAICompatModel(id, catalogModel)), {
    headers: { "Content-Type": "application/json" },
  });
}
