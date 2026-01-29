import type { ModelCatalog } from "./types";

export function createModelCatalog(...entries: Array<ModelCatalog | ModelCatalog[]>): ModelCatalog {
  return Object.assign({}, ...entries.flat());
}
