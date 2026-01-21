export type CatalogModel = {
  name: string;
  created?: string;
  knowledge?: string;
  modalities?: {
    input?: string[];
    output?: string[];
  };
  context?: number;
  capabilities?: string[];
  providers?: string[];
  [key: string]: any;
};

export type ModelCatalog = {
  [modelId: string]: CatalogModel;
};
export function createModelCatalog(catalog: ModelCatalog): ModelCatalog {
  return catalog;
}
