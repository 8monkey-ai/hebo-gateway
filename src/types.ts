import type { ProviderV3 } from "@ai-sdk/provider";

import type { ChatCompletionsBody } from "./endpoints/chat-completions/schema";
import type { EmbeddingsBody } from "./endpoints/embeddings/schema";
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
 * Per-request context shared across handlers and hooks.
 */
export type GatewayContext = {
  /**
   * Mutable bag for passing data between hooks.
   */
  state: Record<string, unknown>;
  /**
   * Provider registry from config, when available.
   */
  providers: ProviderRegistry;
  /**
   * Model catalog from config, when available.
   */
  models: ModelCatalog;
  /**
   * Incoming request for the lifecycle.
   */
  request?: Request;
  /**
   * Parsed body from the request, when available.
   */
  body?: ChatCompletionsBody | EmbeddingsBody;
  /**
   * Incoming model ID, when available.
   */
  modelId?: ModelId;
  /**
   * Resolved model ID, when available.
   */
  resolvedModelId?: ModelId;
  /**
   * Operation type, when available.
   */
  operation?: "text" | "embeddings";
  /**
   * Resolved provider instance, when available.
   */
  provider?: ProviderV3;
  /**
   * Response returned by the handler, when available.
   */
  response?: Response;
};

/**
 * Hook context: all fields readonly except `state`.
 */
export type HookContext = Omit<Readonly<GatewayContext>, "state"> & {
  state: GatewayContext["state"];
};

/**
 * Hooks to plugin to the gateway lifecycle.
 */
export type GatewayHooks = {
  /**
   * Runs before any endpoint handler logic.
   * @returns Optional RequestPatch to merge into headers / override body.
   * Returning a Response stops execution of the endpoint.
   */
  before?: (
    ctx: HookContext,
  ) => void | RequestPatch | Response | Promise<void | RequestPatch | Response>;
  /**
   * Maps a user-provided model ID or alias to a canonical ID.
   * @returns Canonical model ID or undefined to keep original.
   */
  resolveModelId?: (ctx: HookContext) => ModelId | void | Promise<ModelId | void>;
  /**
   * Picks a provider instance for the request.
   * @returns ProviderV3 to override, or undefined to use default.
   */
  resolveProvider?: (ctx: HookContext) => ProviderV3 | void | Promise<ProviderV3 | void>;
  /**
   * Runs after the endpoint handler.
   * @returns Response to replace, or undefined to keep original.
   */
  after?: (ctx: HookContext) => void | Response | Promise<void | Response>;
};

/**
 * Main configuration object for the gateway.
 */
export type GatewayConfig = {
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
  /**
   * Advanced settings.
   */
  advanced?: {
    /**
     * Disable built-in default settings middleware.
     * - true: disable all defaults
     */
    disableDefaultSettings?: boolean;
    /**
     * Disable forwarding unknown providerOptions into provider-specific namespaces.
     * - true: disable for all
     */
    disableForwardParams?: boolean;
  };
};

export const kParsed = Symbol("hebo.gateway.parsed");
export type GatewayConfigParsed = GatewayConfig & {
  [kParsed]: true;
};

export interface Endpoint {
  handler: (request: Request, state?: Record<string, unknown>) => Promise<Response>;
}

export interface HeboGateway<Routes extends Record<string, Endpoint>> extends Endpoint {
  routes: Routes;
}
