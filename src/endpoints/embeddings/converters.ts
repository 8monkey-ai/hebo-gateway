import type { ProviderOptions } from "@ai-sdk/provider-utils";
import type { EmbedManyResult } from "ai";

import type { EmbeddingsInputs, Embeddings, EmbeddingsData, EmbeddingsUsage } from "./schema";

export type EmbedCallOptions = {
  values: string[];
  providerOptions: ProviderOptions;
};

export function transformEmbeddingsInputs(params: EmbeddingsInputs): EmbedCallOptions {
  const { input, ...rest } = params;

  return {
    values: Array.isArray(input) ? input : [input],
    providerOptions: {
      openAICompat: rest,
    },
  };
}

export function toEmbeddings(embedManyResult: EmbedManyResult, modelId: string): Embeddings {
  const data: EmbeddingsData[] = embedManyResult.embeddings.map((embedding, index) => ({
    object: "embedding",
    embedding,
    index,
  }));

  const usage: EmbeddingsUsage = {
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

export function createEmbeddingsResponse(
  embedManyResult: EmbedManyResult,
  modelId: string,
): Response {
  return new Response(JSON.stringify(toEmbeddings(embedManyResult, modelId)), {
    headers: { "Content-Type": "application/json" },
  });
}
