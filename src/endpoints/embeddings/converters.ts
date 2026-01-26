import type { EmbedManyResult } from "ai";

import type {
  OpenAICompatibleEmbedding,
  OpenAICompatibleEmbeddingParams,
  OpenAICompatibleEmbeddingResponseBody,
  OpenAICompatibleEmbeddingUsage,
} from "./schema";

export type VercelAIEmbeddingsModelParams = {
  values: string[];
  providerOptions: Record<string, unknown>;
};

function fromOpenAICompatibleInput(input: string | string[]): string[] {
  return Array.isArray(input) ? input : [input];
}

export function fromOpenAICompatibleEmbeddingParams(
  params: OpenAICompatibleEmbeddingParams,
): VercelAIEmbeddingsModelParams {
  const { input, ...rest } = params;
  const values = fromOpenAICompatibleInput(input);

  return {
    values,
    providerOptions: rest,
  };
}

export function toOpenAICompatibleEmbeddingResponse(
  embedManyResult: EmbedManyResult,
  modelId: string,
): Response {
  const data: OpenAICompatibleEmbedding[] = embedManyResult.embeddings.map((embedding, index) => ({
    object: "embedding",
    embedding,
    index,
  }));

  const usage: OpenAICompatibleEmbeddingUsage = {
    prompt_tokens: embedManyResult.usage?.tokens || 0,
    total_tokens: embedManyResult.usage?.tokens || 0,
  };

  const body: OpenAICompatibleEmbeddingResponseBody = {
    object: "list",
    data,
    model: modelId,
    usage,
    providerMetadata: embedManyResult.providerMetadata,
  };

  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
}
