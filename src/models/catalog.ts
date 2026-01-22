import type { ModelCatalog } from "./types";

export function createModelCatalog(...entries: ModelCatalog[]): ModelCatalog {
  return Object.assign({}, ...entries);
}
