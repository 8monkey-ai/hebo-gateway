import type {
  OpenAICompatibleEmbeddingObject,
  OpenAICompatibleEmbeddingResponse,
  OpenAICompatibleEmbeddingUsage,
} from "./schema";

export function toOpenAICompatibleEmbeddingResponse(
  modelId: string,
  embedManyResult: { embeddings: number[][]; usage?: { tokens?: number } },
): OpenAICompatibleEmbeddingResponse {
  const data: OpenAICompatibleEmbeddingObject[] = embedManyResult.embeddings.map(
    (embedding, index) => ({
      object: "embedding",
      embedding,
      index,
    }),
  );

  const usage: OpenAICompatibleEmbeddingUsage = {
    prompt_tokens: embedManyResult.usage?.tokens || 0,
    total_tokens: embedManyResult.usage?.tokens || 0,
  };

  return {
    object: "list",
    data,
    model: modelId,
    usage,
  };
}
