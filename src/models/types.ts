export const CANONICAL_MODEL_IDS = [
  // Anthropic
  "anthropic/claude-haiku-4.5",
  "anthropic/claude-sonnet-4.5",
  "anthropic/claude-opus-4.5",
  // OpenAI
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  // Google
  "google/gemini-3-pro-preview",
  "google/gemini-3-flash-preview",
  "voyage/voyage-4-lite",
] as const;

export type CanonicalModelId = (typeof CANONICAL_MODEL_IDS)[number];
export type ModelId = CanonicalModelId | (string & object);

export type CatalogModel = {
  name: string;
  created?: string;
  knowledge?: string;
  modalities: {
    input: readonly ("text" | "image" | "file" | "audio" | "video" | "pdf")[];
    output: readonly ("text" | "image" | "audio" | "video" | "embeddings")[];
  };
  context?: number;
  capabilities?: readonly (
    | "attachments"
    | "reasoning"
    | "tool_call"
    | "structured_output"
    | "temperature"
  )[];
  providers: readonly string[];
  additionalProperties?: Record<string, unknown>;
};

export type ModelCatalog = Partial<Record<ModelId, CatalogModel>>;
