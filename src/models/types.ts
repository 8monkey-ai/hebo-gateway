import type { ProviderId } from "../providers/types.ts";

/**
 * Canonical model ID: the models.dev lab ID (`<lab>/<model>`), e.g. `anthropic/claude-opus-4-5`.
 *   https://models.dev
 */
export type ModelId = string;

export type CatalogModel = {
  name?: string;
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
  providers: readonly ProviderId[];
  additionalProperties?: Record<string, unknown>;
};

export type ModelCatalog = {
  [K in ModelId]?: CatalogModel;
};
