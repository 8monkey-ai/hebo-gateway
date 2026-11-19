import type { ProviderId } from "../providers/types.ts";

// Model IDs known at build time: the keys of the models.dev snapshots bundled with each lab.
type SnapshotIds<T> = Extract<keyof T, string>;

/**
 * Canonical model ID: the models.dev lab ID (`<lab>/<model>`), e.g. `anthropic/claude-opus-4-6`.
 *   https://models.dev
 */
export type CanonicalModelId =
  | SnapshotIds<typeof import("./alibaba/models-dev.json", { with: { type: "json" } })>
  | SnapshotIds<typeof import("./amazon/models-dev.json", { with: { type: "json" } })>
  | SnapshotIds<typeof import("./anthropic/models-dev.json", { with: { type: "json" } })>
  | SnapshotIds<typeof import("./cohere/models-dev.json", { with: { type: "json" } })>
  | SnapshotIds<typeof import("./deepseek/models-dev.json", { with: { type: "json" } })>
  | SnapshotIds<typeof import("./google/models-dev.json", { with: { type: "json" } })>
  | SnapshotIds<typeof import("./meta/models-dev.json", { with: { type: "json" } })>
  | SnapshotIds<typeof import("./microsoft/models-dev.json", { with: { type: "json" } })>
  | SnapshotIds<typeof import("./minimax/models-dev.json", { with: { type: "json" } })>
  | SnapshotIds<typeof import("./moonshot/models-dev.json", { with: { type: "json" } })>
  | SnapshotIds<typeof import("./openai/models-dev.json", { with: { type: "json" } })>
  | SnapshotIds<typeof import("./voyage/models-dev.json", { with: { type: "json" } })>
  | SnapshotIds<typeof import("./xai/models-dev.json", { with: { type: "json" } })>
  | SnapshotIds<typeof import("./zai/models-dev.json", { with: { type: "json" } })>;

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
