import type { ReasoningEffort } from "../endpoints/shared/schema.ts";
import type { ProviderId } from "../providers/types.ts";

/**
 * Model IDs known at build time. Each lab module adds the keys of its bundled models.dev
 * snapshot, so only the IDs of imported labs autocomplete.
 */
export interface CanonicalModelIds {}

/**
 * Canonical model ID: the models.dev lab ID (`<lab>/<model>`), e.g. `anthropic/claude-opus-4-6`.
 *   https://models.dev
 */
export type CanonicalModelId = Extract<keyof CanonicalModelIds, string>;

// Models released after the build are accepted too.
// oxlint-disable-next-line ban-types
export type ModelId = CanonicalModelId | (string & {});

export type CatalogModel = {
  name?: string;
  /** models.dev family (product line), e.g. `claude-opus`. Each one has its own `latest`. */
  family?: string;
  /** Pre-release models (`alpha` / `beta`) are never part of `latest`. */
  status?: "alpha" | "beta";
  created?: string;
  knowledge?: string;
  modalities?: {
    input: readonly ("text" | "image" | "file" | "audio" | "video")[];
    output: readonly ("text" | "image" | "audio" | "video" | "embeddings" | "transcription")[];
  };
  context?: number;
  capabilities?: readonly (
    | "attachments"
    | "reasoning"
    | "tool_call"
    | "structured_output"
    | "temperature"
  )[];
  /** Providers serving the model, in routing preference order. */
  providers: readonly ProviderId[];
  additionalProperties?: Record<string, unknown>;
};

export type ModelCatalog = {
  [K in ModelId]?: CatalogModel;
};

/**
 * How a model takes reasoning controls on a provider (models.dev `reasoning_options`). A
 * model that lists none of them can't be controlled.
 */
export type ReasoningControls = {
  /** Effort levels the model takes, lowest first. `none` turns reasoning off. */
  effort?: readonly ReasoningEffort[];
  /** Reasoning can be switched on and off. */
  toggle?: boolean;
  /** Reasoning takes a token budget. */
  budget?: { min?: number; max?: number };
};

/**
 * A model as a provider serves it, per models.dev. Middleware reads it with `specOf(model)`, so
 * new models need no code change. Every field is optional:
 * custom models carry none of them.
 */
export type ModelSpec = {
  /**
   * Provider-native model ID. Left to the provider when unset: its `extraMapping`, or its
   * fallback rule (usually the canonical ID without its namespace).
   */
  id?: string;
  /**
   * Bedrock: served through a cross-region inference profile, `required` (only) or
   * `optional` (on demand too). The configured profile prefixes `id`.
   */
  profile?: "required" | "optional";
  /** Bedrock: served by the OpenAI-compatible Mantle endpoint. */
  route?: "mantle";
  /** Maximum output tokens. */
  output?: number;
  /** Reasoning controls. `false`: the model doesn't reason, unset: unknown. */
  reasoning?: ReasoningControls | false;
};

/**
 * Providers serving a models.dev model, mapped to how they serve it. Key order is the routing
 * preference.
 */
export type ModelSpecs = { readonly [P in ProviderId]?: ModelSpec };

/** A model as loaded from models.dev, with the spec of each provider. */
export type ModelsDevCatalogModel = Omit<CatalogModel, "providers"> & {
  providers: ModelSpecs;
};

export type ModelsDevCatalog = {
  [K in ModelId]?: ModelsDevCatalogModel;
};

/**
 * The model IDs of a bundled snapshot, for lab modules to add to `CanonicalModelIds`:
 * `interface CanonicalModelIds extends SnapshotIds<typeof import("./models-dev.json", …)> {}`.
 */
export type SnapshotIds<T> = { [K in keyof T]: true };
