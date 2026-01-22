import type { EmbedManyResult } from "ai";

import type {
  OpenAICompatibleEmbedding,
  OpenAICompatibleEmbeddingResponseBody,
  OpenAICompatibleEmbeddingUsage,
} from "./schema";

export function toOpenAICompatibleEmbeddingResponseBody(
  embedManyResult: EmbedManyResult,
  modelId: string,
): OpenAICompatibleEmbeddingResponseBody {
  const data: OpenAICompatibleEmbedding[] = embedManyResult.embeddings.map((embedding, index) => ({
    object: "embedding",
    embedding,
    index,
  }));

  const usage: OpenAICompatibleEmbeddingUsage = {
    prompt_tokens: embedManyResult.usage?.tokens || 0,
    total_tokens: embedManyResult.usage?.tokens || 0,
  };

  return {
    object: "list",
    data,
    model: modelId,
    usage,
    providerMetadata: embedManyResult.providerMetadata,
  };
}
