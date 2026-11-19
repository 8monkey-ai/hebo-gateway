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
 * Providers serving a models.dev model, mapped to their provider-native model ID. Key order is
 * the routing preference. Bedrock IDs may start with `{ip}` (inference profile required) or
 * `{ip?}` (inference profile optional), and `mantle:` (served by Bedrock Mantle). `undefined`
 * (custom models) leaves the native ID to the provider: its `extraMapping`, or its fallback
 * rule (usually the canonical ID without its namespace).
 */
export type NativeModelIds = { readonly [P in ProviderId]?: string | undefined };

/** A model as loaded from models.dev, with the native ID of each provider. */
export type ModelsDevCatalogModel = Omit<CatalogModel, "providers"> & {
  providers: NativeModelIds;
};

export type ModelsDevCatalog = {
  [K in ModelId]?: ModelsDevCatalogModel;
};
