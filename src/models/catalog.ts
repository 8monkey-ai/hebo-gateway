import type { ModelCatalog } from "./types";

type ModelCatalogInput =
  | ModelCatalog
  | (() => ModelCatalog)
  | ModelCatalog[]
  | (() => ModelCatalog)[];

export function defineModelCatalog(...inputs: ModelCatalogInput[]): ModelCatalog {
  const catalogs = inputs.flat().map((input) => (typeof input === "function" ? input() : input));

  const out: ModelCatalog = {};
  for (const catalog of catalogs) {
    Object.assign(out, catalog);
  }
  return out;
}
