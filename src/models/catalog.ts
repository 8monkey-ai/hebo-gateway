import type { ModelCatalog } from "./types";

type ModelCatalogInput =
  | ModelCatalog
  | (() => ModelCatalog)
  | ModelCatalog[]
  | (() => ModelCatalog)[];

export function defineModelCatalog(...inputs: ModelCatalogInput[]): ModelCatalog {
  const catalogs = inputs.flat().map((input) => (typeof input === "function" ? input() : input));

  return Object.assign({}, ...catalogs);
}
