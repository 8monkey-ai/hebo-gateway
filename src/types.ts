import type { ProviderRegistryProvider } from "ai";

import type { ModelCatalog } from "./models/types";

export type GatewayHooks = {
  before?: (request: Request) => Promise<void | Response>;
  resolveModelId?: (modelId: string) => Promise<string>;
  resolveProvider?: (originalModelId: string, resolvedModelId: string) => Promise<string>;
  after?: (response: Response) => Promise<Response | void>;
};

export type GatewayConfig = {
  basePath?: string;
  providers?: ProviderRegistryProvider;
  models?: ModelCatalog;
  hooks?: GatewayHooks;
};

export interface HeboGateway {
  handler: typeof fetch;
}
