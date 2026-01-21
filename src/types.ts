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

export type GatewayHooks = {
  before?: (request: Request) => Promise<void | Response>;
  resolveModelId?: (modelId: string) => Promise<string>;
  resolveProvider?: (originalModelId: string, resolvedModelId: string) => Promise<string>;
  after?: (response: Response) => Promise<Response | void>;
};

export type SupportedProvider =
  | "openai"
  | "anthropic"
  | "google"
  | "google-vertex"
  | "azure"
  | "amazon-bedrock"
  | "cohere"
  | "mistral"
  | "groq"
  | "cerebras"
  | "deepinfra"
  | "deepseek"
  | "fireworks"
  | "perplexity"
  | "replicate"
  | "togetherai"
  | "xai";

export type ProviderRegistry = Partial<Record<SupportedProvider, any>>;

export type GatewayConfig = {
  basePath?: string;
  providers?: ProviderRegistry;
  models?: ModelCatalog;
  hooks?: GatewayHooks;
};

export interface HeboGateway {
  handler: (request: Request) => Promise<Response>;
}
