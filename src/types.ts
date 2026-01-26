import type { ProviderRegistryProvider } from "ai";

import type { ModelCatalog } from "./models/types";
import type { ProviderRegistry } from "./providers/types";

export type GatewayHooks = {
  before?: (request: Request) => Promise<void | Response>;
  resolveModelId?: (modelId: string) => Promise<string>;
  resolveProvider?: (originalModelId: string, resolvedModelId: string) => Promise<string>;
  after?: (response: Response) => Promise<Response | void>;
};

export type GatewayConfigBase = {
  basePath?: string;
  providers: ProviderRegistry;
  models: ModelCatalog;
  hooks?: GatewayHooks;
};

export type GatewayConfigRegistry = Omit<GatewayConfigBase, "providers"> & {
  providers: ProviderRegistryProvider;
};

export type GatewayConfig = GatewayConfigBase | GatewayConfigRegistry;

export const kParsed = Symbol("hebo.gateway.parsed");
export type GatewayConfigParsed = GatewayConfigRegistry & {
  [kParsed]: true;
};

export interface Endpoint {
  handler: typeof fetch;
}

export interface HeboGateway<Routes extends Record<string, Endpoint>> extends Endpoint {
  routes: Routes;
}
