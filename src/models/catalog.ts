import type { ModelCatalog } from "./types";

type ModelCatalogInput =
  | ModelCatalog
  | (() => ModelCatalog)
  | ModelCatalog[]
  | (() => ModelCatalog)[];

export function createModelCatalog(...inputs: ModelCatalogInput[]): ModelCatalog {
  const catalogs: ModelCatalog[] = [];

  for (const input of inputs) {
    if (Array.isArray(input)) {
      for (const item of input) {
        catalogs.push(typeof item === "function" ? item() : item);
      }
    } else {
      catalogs.push(typeof input === "function" ? input() : input);
    }
  }

  return Object.assign({}, ...catalogs);
}
