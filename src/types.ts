import type { ProviderV3 } from "@ai-sdk/provider";
import type { Attributes, Tracer } from "@opentelemetry/api";

import type {
  ChatCompletions,
  ChatCompletionsBody,
  ChatCompletionsStream,
} from "./endpoints/chat-completions/schema";
import type { ConversationStorage } from "./endpoints/conversations/storage/types";
import type { Embeddings, EmbeddingsBody } from "./endpoints/embeddings/schema";
import type { Messages, MessagesBody, MessagesStream } from "./endpoints/messages/schema";
import type { Model, ModelList } from "./endpoints/models";
import type { Responses, ResponsesBody, ResponsesStream } from "./endpoints/responses/schema";
import type { Logger, LoggerConfig } from "./logger";
import type { ModelCatalog, ModelId } from "./models/types";
import type { ProviderId, ProviderRegistry } from "./providers/types";

export type GatewayOperation =
  | "chat"
  | "embeddings"
  | "messages"
  | "responses"
  | "models"
  | "conversations";

/**
 * Per-request context shared across handlers and hooks.
 */
export type GatewayContext = {
  /**
   * Mutable bag for passing data between hooks.
   */
  state: Record<string, unknown>;
  /**
   * OpenTelemetry attribute bag populated by hooks.
   * Attributes set here are applied to both spans and all metric instruments.
   */
  otel: Attributes;
  /**
   * Provider registry from config.
   */
  providers: ProviderRegistry;
  /**
   * Model catalog from config.
   */
  models: ModelCatalog;
  /**
   * Incoming request for the handler.
   */
  request: Request;
  /**
   * Resolved request ID for logging and telemetry.
   */
  requestId: string;
  /**
   * Parsed body from the request.
   */
  body?: ChatCompletionsBody | EmbeddingsBody | MessagesBody | ResponsesBody;
  /**
   * Incoming model ID.
   */
  modelId?: ModelId;
  /**
   * Resolved model ID.
   */
  resolvedModelId?: ModelId;
  /**
   * Operation type.
   */
  operation?: GatewayOperation;
  /**
   * Resolved provider instance.
   */
  provider?: ProviderV3;
  /**
   * Resolved provider ID.
   */
  resolvedProviderId?: ProviderId;
  /**
   * Result returned by the handler (pre-response).
   */
  result?:
    | ChatCompletions
    | ChatCompletionsStream
    | Embeddings
    | Messages
    | MessagesStream
    | Model
    | ModelList
    | Responses
    | ResponsesStream;
  /**
   * Response object returned by the handler.
   */
  response?: Response;
  /**
   * Per-request telemetry signal level override.
   * When set (via body parameter or hook), overrides `cfg.telemetry.signals.gen_ai`
   * for this request's span attributes and metrics.
   */
  trace?: TelemetrySignalLevel;
  /**
   * Error thrown during execution.
   */
  error?: unknown;
};

/**
 * Hook context: all fields readonly except `state` and `otel`.
 */
export type HookContext = Omit<Readonly<GatewayContext>, "state" | "otel" | "trace"> & {
  state: GatewayContext["state"];
  otel: GatewayContext["otel"];
  trace: GatewayContext["trace"];
};

type RequiredHookContext<K extends keyof GatewayContext> = Omit<HookContext, K> &
  Required<Pick<HookContext, K>>;
export type OnRequestHookContext = RequiredHookContext<"request">;
export type BeforeHookContext = RequiredHookContext<"request" | "operation" | "body">;
export type ResolveModelHookContext = RequiredHookContext<
  "request" | "operation" | "body" | "modelId"
>;
export type ResolveProviderHookContext = RequiredHookContext<
  "request" | "operation" | "body" | "modelId" | "resolvedModelId"
>;
export type AfterHookContext = RequiredHookContext<
  | "request"
  | "operation"
  | "body"
  | "modelId"
  | "resolvedModelId"
  | "provider"
  | "resolvedProviderId"
  | "result"
>;
export type OnResponseHookContext = RequiredHookContext<"request" | "response">;
export type OnErrorHookContext = RequiredHookContext<"error">;

/**
 * Hooks to plugin to the gateway lifecycle.
 */
export type GatewayHooks = {
  /**
   * Runs before any endpoint handler logic.
   * @returns Optional Response to short-circuit the request.
   */
  onRequest?: (ctx: OnRequestHookContext) => void | Response | Promise<void | Response>;
  /**
   * Runs after request JSON is parsed and validated for chat completions / embeddings / responses.
   * @returns Replacement parsed body, or undefined to keep original.
   */
  before?: (
    ctx: BeforeHookContext,
  ) =>
    | void
    | ChatCompletionsBody
    | EmbeddingsBody
    | MessagesBody
    | ResponsesBody
    | Promise<void | ChatCompletionsBody | EmbeddingsBody | MessagesBody | ResponsesBody>;
  /**
   * Maps a user-provided model ID or alias to a canonical ID.
   * @returns Canonical model ID or undefined to keep original.
   */
  resolveModelId?: (ctx: ResolveModelHookContext) => ModelId | void | Promise<ModelId | void>;
  /**
   * Picks a provider instance for the request.
   * @returns ProviderV3 to override, or undefined to use default.
   */
  resolveProvider?: (
    ctx: ResolveProviderHookContext,
  ) => ProviderV3 | void | Promise<ProviderV3 | void>;
  /**
   * Runs after the endpoint handler.
   * @returns Result to replace, or undefined to keep original.
   */
  after?: (
    ctx: AfterHookContext,
  ) =>
    | void
    | ChatCompletions
    | ChatCompletionsStream
    | Embeddings
    | Messages
    | MessagesStream
    | Model
    | ModelList
    | Responses
    | ResponsesStream
    | Promise<
        | void
        | ChatCompletions
        | ChatCompletionsStream
        | Embeddings
        | Messages
        | MessagesStream
        | Model
        | ModelList
        | Responses
        | ResponsesStream
      >;
  /**
   * Runs after the lifecycle has produced the final Response.
   * @returns Replacement Response, or undefined to keep original.
   */
  onResponse?: (ctx: OnResponseHookContext) => void | Response | Promise<void | Response>;
  /**
   * Runs when the lifecycle catches an error.
   * @returns Optional Response to replace the default error response.
   */
  onError?: (ctx: OnErrorHookContext) => void | Response | Promise<void | Response>;
};

export type TelemetrySignalLevel = "off" | "required" | "recommended" | "full";

export const DEFAULT_CHAT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
export type GatewayTimeout =
  | number
  | null
  | {
      /**
       * Default timeout used.
       */
      normal?: number | null;
      /**
       * Timeout used when `service_tier=flex`.
       * Defaults to 3x `normal` when omitted.
       */
      flex?: number | null;
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
   * Preferred logger configuration: custom logger or default logger settings.
   */
  logger?: Logger | LoggerConfig | null;
  /**
   * Optional conversation storage backend.
   * Defaults to an in-memory storage if not provided.
   */
  storage?: ConversationStorage;
  /**
   * Optional AI SDK telemetry configuration.
   */
  telemetry?: {
    /**
     * Enable AI SDK OpenTelemetry instrumentation.
     * Disabled by default.
     */
    enabled?: boolean;
    /**
     * Optional custom OpenTelemetry tracer passed to AI SDK telemetry.
     */
    tracer?: Tracer;
    /**
     * Telemetry signal levels by namespace.
     * - off: disable the namespace
     * - required: minimal baseline
     * - recommended: practical defaults
     * - full: include all available details
     */
    signals?: {
      gen_ai?: TelemetrySignalLevel;
      http?: TelemetrySignalLevel;
      hebo?: TelemetrySignalLevel;
    };
  };
  /**
   * Optional timeout for server responses.
   * Supports a number in milliseconds, or tiered config.
   */
  timeouts?: GatewayTimeout;
  /**
   * Maximum *decompressed* request body size in bytes for gzip/deflate-encoded requests.
   * Plain (uncompressed) request body size limits should be configured at the
   * framework or server level (e.g. Hono `bodyLimit` middleware, Bun `maxRequestBodySize`).
   * Set to `0` to disable the decompressed size limit.
   * Defaults to 10 MB (10,485,760 bytes).
   */
  maxBodySize?: number;
};

export const kParsed = Symbol("hebo.gateway.parsed");
export type GatewayConfigParsed = Omit<GatewayConfig, "storage" | "timeouts"> & {
  storage: ConversationStorage;
  timeouts: {
    normal?: number;
    flex?: number;
  };
  maxBodySize: number;
  [kParsed]: true;
};

export interface Endpoint {
  handler: (request: Request, state?: Record<string, unknown>) => Promise<Response>;
}

export interface HeboGateway<Routes extends Record<string, Endpoint>> extends Endpoint {
  routes: Routes;
}
