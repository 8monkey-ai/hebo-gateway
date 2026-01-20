export interface ModelDefinition {
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
}

export interface ModelCatalog {
  [modelId: string]: ModelDefinition;
}

export interface HeboGatewayConfig {
  providers?: any;
  models?: ModelCatalog;
  hooks?: {
    before?: (request: Request) => Promise<void | Response>;
    resolveModelId?: (modelId: string) => Promise<string>;
    resolveProvider?: (originalModelId: string, resolvedModelId: string) => Promise<string>;
    after?: (response: Response) => Promise<Response | void>;
  };
}

export interface APIContext {
  request: Request;
  config: HeboGatewayConfig;
  url: URL;
}

export type HTTPMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS" | "HEAD";

export interface Endpoint {
  path: string;
  method: HTTPMethod;
  handler: (ctx: APIContext) => Promise<Response>;
}

export interface HeboGateway {
  handler: (request: Request) => Promise<Response>;
}
