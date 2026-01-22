import type { CatalogModel } from "./types";

export function createModelCatalog<const Entries extends Record<string, CatalogModel>[]>(
  ...entries: Entries
) {
  return Object.assign({}, ...entries) as {
    [K in keyof Entries[number]]: Entries[number][K];
  };
}
