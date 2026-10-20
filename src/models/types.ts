import type { ProviderId } from "../providers/types";

export const CANONICAL_MODEL_IDS = [
  // Anthropic
  "anthropic/claude-opus-5.5",
  "anthropic/claude-sonnet-5.5",
  "anthropic/claude-haiku-5.5",
  "anthropic/claude-opus-5",
  "anthropic/claude-sonnet-5",
  "anthropic/claude-fable-5.1",
  "anthropic/claude-fable-5",
  "anthropic/claude-opus-4.8",
  "anthropic/claude-opus-4.7",
  "anthropic/claude-opus-4.6",
  "anthropic/claude-sonnet-4.6",
  "anthropic/claude-haiku-4.5",
  "anthropic/claude-opus-4.5",
  // OpenAI
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "openai/gpt-5.2",
  "openai/gpt-5.2-pro",
  "openai/gpt-5.3-codex-spark",
  "openai/gpt-5.4",
  "openai/gpt-5.4-mini",
  "openai/gpt-5.4-pro",
  "openai/gpt-5.5",
  "openai/gpt-5.5-pro",
  "openai/gpt-5.6-sol",
  "openai/gpt-5.6-terra",
  "openai/gpt-5.6-luna",
  "openai/gpt-6-astra",
  "openai/gpt-6-sol",
  "openai/gpt-6-luna",
  "openai/gpt-6.1-sol",
  "openai/text-embedding-3-small",
  "openai/text-embedding-3-large",
  "openai/gpt-transcribe",
  // Amazon
  "amazon/nova-micro",
  "amazon/nova-lite",
  "amazon/nova-pro",
  "amazon/nova-premier",
  "amazon/nova-2-lite",
  "amazon/nova-2-multimodal-embeddings",
  // Google
  "google/gemini-3-flash-preview",
  "google/gemini-3.1-flash-lite",
  "google/gemini-3.1-pro-preview",
  "google/gemini-3.5-flash",
  "google/gemini-3.5-flash-lite",
  "google/gemini-3.6-flash",
  "google/gemini-3.7-flash",
  "google/gemini-3.8-flash",
  "google/gemini-embedding-2",
  "google/gemini-3.5-transcribe",
  "google/gemma-3-1b",
  "google/gemma-3-4b",
  "google/gemma-3-12b",
  "google/gemma-3-27b",
  "google/gemma-4-e2b",
  "google/gemma-4-e4b",
  "google/gemma-4-26b-a4b",
  "google/gemma-4-31b",
  // Microsoft
  "microsoft/mai-transcribe-2",
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
  "cohere/command-a-plus",
  "cohere/command-r7b",
  "cohere/command-a-translate",
  "cohere/command-a-reasoning",
  "cohere/command-a-vision",
  "cohere/north-mini-code",
  "cohere/north-small-translate",
  // MiniMax
  "minimax/m2.5",
  "minimax/m2.7",
  "minimax/m3",
  // Moonshot
  "moonshot/kimi-k2.5",
  "moonshot/kimi-k2.6",
  "moonshot/kimi-k2.7-code",
  "moonshot/kimi-k3",
  // xAI
  "xai/grok-4.2",
  "xai/grok-4.3",
  "xai/grok-4.20",
  "xai/grok-4.20-multi-agent",
  "xai/grok-4.5",
  "xai/grok-4.6",
  "xai/grok-4.7",
  "xai/grok-voice-transcribe-2.0",
  // DeepSeek
  "deepseek/deepseek-v4-pro",
  "deepseek/deepseek-v4.1-flash",
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
  // Alibaba (Qwen)
  "alibaba/qwen3.5-plus",
  "alibaba/qwen3.5-flash",
  "alibaba/qwen3.5-397b",
  "alibaba/qwen3.5-122b",
  "alibaba/qwen3.5-35b",
  "alibaba/qwen3.5-27b",
  "alibaba/qwen3.5-9b",
  "alibaba/qwen3.5-4b",
  "alibaba/qwen3.5-2b",
  "alibaba/qwen3.5-0.8b",
  "alibaba/qwen3.6-plus",
  "alibaba/qwen3.6-flash",
  "alibaba/qwen3.6-27b",
  "alibaba/qwen3.7-plus",
  "alibaba/qwen3.7-max",
  "alibaba/qwen3.8-max",
  "alibaba/qwen3.8-max-prime",
  "alibaba/qwen3.8-flash",
  "alibaba/qwen3.8-omni-flash",
  "alibaba/qwen3.8-2.4t",
  "alibaba/qwen3.8-27b",
  "alibaba/qwen3-embedding-0.6b",
  "alibaba/qwen3-embedding-4b",
  "alibaba/qwen3-embedding-8b",
  // Z.ai (GLM)
  "zhipu/glm-5",
  "zhipu/glm-5-turbo",
  "zhipu/glm-5.1",
  "zhipu/glm-5.2",
  "zhipu/glm-5.3",
  "zhipu/glm-5.3-flash",
] as const;

export type CanonicalModelId = (typeof CANONICAL_MODEL_IDS)[number];
// oxlint-disable-next-line ban-types
export type ModelId = CanonicalModelId | (string & {});

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
