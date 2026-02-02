import type { ProviderId } from "../providers/types";

export const CANONICAL_MODEL_IDS = [
  // Anthropic
  "anthropic/claude-haiku-4.5",
  "anthropic/claude-sonnet-4.5",
  "anthropic/claude-opus-4.5",
  "anthropic/claude-opus-4.1",
  "anthropic/claude-opus-4",
  "anthropic/claude-sonnet-4",
  "anthropic/claude-sonnet-3.7",
  "anthropic/claude-sonnet-3.5",
  "anthropic/claude-haiku-3.5",
  "anthropic/claude-haiku-3",
  // OpenAI
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "openai/gpt-5",
  "openai/gpt-5-pro",
  "openai/gpt-5.2",
  "openai/gpt-5.2-chat",
  "openai/gpt-5.2-pro",
  "openai/gpt-5.2-codex",
  "openai/gpt-5-mini",
  "openai/gpt-5-nano",
  "openai/gpt-5-codex",
  "openai/gpt-5.1-codex",
  "openai/gpt-5.1-codex-max",
  "openai/gpt-5.1-chat",
  "openai/gpt-5.1",
  "openai/text-embedding-3-small",
  "openai/text-embedding-3-large",
  // Amazon
  "amazon/nova-micro",
  "amazon/nova-lite",
  "amazon/nova-pro",
  "amazon/nova-premier",
  "amazon/nova-2-lite",
  "amazon/nova-2-multimodal-embeddings",
  // Google
  "google/gemini-2.5-flash-lite",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-pro",
  "google/gemini-3-flash-preview",
  "google/gemini-3-pro-preview",
  "google/embedding-001",
  // Meta
  "meta/llama-3.1-8b",
  "meta/llama-3.1-70b",
  "meta/llama-3.1-405b",
  "meta/llama-3.2-1b",
  "meta/llama-3.2-3b",
  "meta/llama-3.2-11b",
  "meta/llama-3.2-90b",
  "meta/llama-3.3-70b",
  "meta/llama-4-scout",
  "meta/llama-4-maverick",
  // Cohere
  "cohere/embed-v4.0",
  "cohere/embed-english-v3.0",
  "cohere/embed-english-light-v3.0",
  "cohere/embed-multilingual-v3.0",
  "cohere/embed-multilingual-light-v3.0",
  "cohere/command-a",
  "cohere/command-r7b",
  "cohere/command-a-translate",
  "cohere/command-a-reasoning",
  "cohere/command-a-vision",
  "cohere/command-r",
  "cohere/command-r-plus",
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
// eslint-disable-next-line ban-types
export type ModelId = CanonicalModelId | (string & {});

export type CatalogModel = {
  name?: string;
  created?: string;
  knowledge?: string;
  modalities?: {
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
  providers: readonly ProviderId[];
  additionalProperties?: Record<string, unknown>;
};

export type ModelCatalog = {
  [K in ModelId]?: CatalogModel;
};
