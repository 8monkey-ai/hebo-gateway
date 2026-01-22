export type CatalogModel = {
  name: string;
  created?: string;
  knowledge?: string;
  modalities: {
    input: readonly ("text" | "image" | "audio" | "video" | "pdf")[];
    output: readonly ("text" | "image")[];
  };
  context?: number;
  capabilities?: readonly (
    | "attachments"
    | "reasoning"
    | "tool_call"
    | "structured_output"
    | "temperature"
  )[];
  providers: readonly string[];
  [key: string]: any;
};

export type ModelCatalog = {
  [modelId: string]: CatalogModel;
};
