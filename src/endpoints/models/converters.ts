import type { ModelCatalog, CatalogModel } from "../../models/types";
import type { OpenAICompatibleList, OpenAICompatibleModel } from "./schema";

export function toOpenAICompatibleModel(
  id: string,
  catalogModel: CatalogModel,
): OpenAICompatibleModel {
  const { created, providers, modalities, additionalProperties, ...rest } = catalogModel;
  let createdTimestamp = Math.floor(Date.now() / 1000);
  if (created) {
    const parsed = Date.parse(created);
    if (!isNaN(parsed)) {
      createdTimestamp = Math.floor(parsed / 1000);
    }
  }

  const model: OpenAICompatibleModel = {
    id,
    object: "model",
    created: createdTimestamp,
    owned_by: providers?.[0] || "system",
    architecture: {
      input_modalities: (modalities.input || []) as string[],
      modality:
        modalities.input &&
        modalities.output &&
        `${modalities.input?.[0]}->${modalities.output?.[0]}`,
      output_modalities: (modalities.output || []) as string[],
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

export function toOpenAICompatibleModelListResponse(models: ModelCatalog): Response {
  const data = Object.entries(models).map(([id, catalogModel]) =>
    toOpenAICompatibleModel(id, catalogModel!),
  );

  const body: OpenAICompatibleList<OpenAICompatibleModel> = {
    object: "list",
    data,
  };

  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
}

export function toOpenAICompatibleModelResponse(id: string, catalogModel: CatalogModel): Response {
  return new Response(JSON.stringify(toOpenAICompatibleModel(id, catalogModel)), {
    headers: { "Content-Type": "application/json" },
  });
}
