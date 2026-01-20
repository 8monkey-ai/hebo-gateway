import type { ModelCatalog, ModelDefinition } from "../types";
import type { OpenAICompatibleList, OpenAICompatibleModel } from "./schema";

export function toOpenAICompatibleModel(id: string, def: ModelDefinition): OpenAICompatibleModel {
  let createdTimestamp = Math.floor(Date.now() / 1000);
  if (def.created) {
    const parsed = Date.parse(def.created);
    if (!isNaN(parsed)) {
      createdTimestamp = Math.floor(parsed / 1000);
    }
  }

  return {
    id,
    object: "model",
    created: createdTimestamp,
    owned_by: def.providers?.[0] || "system",
  };
}

export function toOpenAICompatibleModelList(
  models: ModelCatalog,
): OpenAICompatibleList<OpenAICompatibleModel> {
  const data = Object.entries(models).map(([id, def]) => toOpenAICompatibleModel(id, def));
  return {
    object: "list",
    data,
  };
}
