import type { ProviderV3 } from "@ai-sdk/provider";
import type { ProviderRegistryProvider } from "ai";

import type { ModelCatalog, ModelId } from "./models/types";
import type { ProviderRegistry } from "./providers/types";

/**
 * Request overrides returned from the `before` hook.
 */
export type RequestPatch = {
  /**
   * Headers to merge into the incoming request.
   */
  headers?: HeadersInit;
  /**
   * Body to replace on the incoming request.
   */
  body?: BodyInit;
};

/**
 * Hooks to plugin to the gateway lifecycle.
 */
export type GatewayHooks = {
  /**
   * Runs before any endpoint handler logic.
   * @param ctx.request Incoming request.
   * @returns Optional RequestPatch to merge into headers / override body.
   * Returning a Response stops execution of the endpoint.
   */
  before?: (ctx: {
    request: Request;
  }) => void | RequestPatch | Response | Promise<void | RequestPatch | Response>;
  /**
   * Maps a user-provided model ID or alias to a canonical ID.
   * @param ctx.modelId Incoming model ID.
   * @returns Canonical model ID or undefined to keep original.
   */
  resolveModelId?: (ctx: { modelId: ModelId }) => ModelId | void | Promise<ModelId | void>;
  /**
   * Picks a provider instance for the request.
   * @param ctx.providers Provider registry.
   * @param ctx.models ModelCatalog from config.
   * @param ctx.modelId Resolved model ID.
   * @param ctx.operation Operation type ("text" | "embeddings").
   * @returns ProviderV3 to override, or undefined to use default.
   */
  resolveProvider?: (ctx: {
    providers: ProviderRegistryProvider;
    models: ModelCatalog;
    modelId: ModelId;
    operation: "text" | "embeddings";
  }) => ProviderV3 | void | Promise<ProviderV3 | void>;
  /**
   * Runs after the endpoint handler.
   * @param ctx.response Response returned by the handler.
   * @returns Response to replace, or undefined to keep original.
   */
  after?: (ctx: { response: Response }) => void | Response | Promise<void | Response>;
};

/**
 * Main configuration object for the gateway.
 */
export type GatewayConfigBase = {
  /**
   * Optional base path the gateway is mounted under (e.g. "/v1/gateway").
   */
  basePath?: string;
  /**
   * Provider registry keyed by canonical provider IDs.
   */
  providers: ProviderRegistry;
  /**
   * Model catalog keyed by canonical model IDs.
   */
  models: ModelCatalog;
  /**
   * Optional lifecycle hooks for routing, auth, and response shaping.
   */
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
