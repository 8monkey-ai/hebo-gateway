export const CANONICAL_MODEL_IDS = [
  // Anthropic
  "anthropic/claude-haiku-4.5",
  "anthropic/claude-sonnet-4.5",
  "anthropic/claude-opus-4.5",
  // OpenAI
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  // Google
  "google/gemini-2.5-flash-lite",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-pro",
  "google/gemini-3-flash-preview",
  "google/gemini-3-pro-preview",
  // Meta
  "meta/llama-3.1-8b",
  "meta/llama-3.3-70b",
  "meta/llama-4-scout",
  "meta/llama-4-maverick",
  // Cohere
  "cohere/embed-v4.0",
  // Voyage
  "voyage/voyage-2-code",
  "voyage/voyage-2-law",
  "voyage/voyage-2-finance",
  "voyage/voyage-3-code",
  "voyage/voyage-3-large",
  "voyage/voyage-3.5-lite",
  "voyage/voyage-3.5",
  "voyage/voyage-4-lite",
  "voyage/voyage-4",
  "voyage/voyage-4-large",
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
