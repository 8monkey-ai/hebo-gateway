import type { ModelCatalog, CatalogModel } from "../../models/types";
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
    architecture: {
      input_modalities: modalities.input || ([] as const),
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
  };

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
