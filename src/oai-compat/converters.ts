import type { ModelCatalog, CatalogModel } from "../types";
import type { OpenAICompatibleList, OpenAICompatibleModel } from "./schema";

export function toOpenAICompatibleModel(
  id: string,
  catalogModel: CatalogModel,
): OpenAICompatibleModel {
  const { created, providers, modalities, ...rest } = catalogModel;
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
    ...rest,
  };

  if (modalities) {
    model.architecture = {
      input_modalities: modalities.input || [],
      output_modalities: modalities.output || [],
    };
  }

  return model;
}

export function toOpenAICompatibleModelList(
  models: ModelCatalog,
): OpenAICompatibleList<OpenAICompatibleModel> {
  const data = Object.entries(models).map(([id, catalogModel]) =>
    toOpenAICompatibleModel(id, catalogModel),
  );
  return {
    object: "list",
    data,
  };
}
