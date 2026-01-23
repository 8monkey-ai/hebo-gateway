import type { EmbedManyResult } from "ai";

import type {
  OpenAICompatibleEmbedding,
  OpenAICompatibleEmbeddingParams,
  OpenAICompatibleEmbeddingResponseBody,
  OpenAICompatibleEmbeddingUsage,
} from "./schema";

export type VercelAIEmbeddingsModelParams = {
  values: string[];
  providerOptions: Record<string, any>;
};

function toEmbedManyValues(input: string | string[]): string[] {
  return Array.isArray(input) ? input : [input];
}

export function convertToEmbeddingsModelParams(
  params: OpenAICompatibleEmbeddingParams,
): VercelAIEmbeddingsModelParams {
  const { input, ...rest } = params;
  const values = toEmbedManyValues(input);

  return {
    values,
    providerOptions: rest,
  };
}

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
