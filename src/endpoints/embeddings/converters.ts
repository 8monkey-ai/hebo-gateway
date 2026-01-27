import type { ProviderOptions } from "@ai-sdk/provider-utils";
import type { EmbedManyResult } from "ai";

import type {
  OpenAICompatEmbeddingsParams,
  OpenAICompatEmbedding,
  OpenAICompatEmbeddingData,
  OpenAICompatEmbeddingUsage,
} from "./schema";

export type EmbeddingCallOptions = {
  values: string[];
  providerOptions: ProviderOptions;
};

function fromOpenAICompatInput(input: string | string[]): string[] {
  return Array.isArray(input) ? input : [input];
}

export function fromOpenAICompatEmbeddingsParams(
  params: OpenAICompatEmbeddingsParams,
): EmbeddingCallOptions {
  const { input, ...rest } = params;
  const values = fromOpenAICompatInput(input);

  return {
    values,
    providerOptions: {
      openAICompat: rest,
    },
  };
}

export function toOpenAICompatEmbedding(
  embedManyResult: EmbedManyResult,
  modelId: string,
): OpenAICompatEmbedding {
  const data: OpenAICompatEmbeddingData[] = embedManyResult.embeddings.map((embedding, index) => ({
    object: "embedding",
    embedding,
    index,
  }));

  const usage: OpenAICompatEmbeddingUsage = {
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

export function createOpenAICompatEmbeddingResponse(
  embedManyResult: EmbedManyResult,
  modelId: string,
): Response {
  return new Response(JSON.stringify(toOpenAICompatEmbedding(embedManyResult, modelId)), {
    headers: { "Content-Type": "application/json" },
  });
}
