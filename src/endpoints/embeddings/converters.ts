import type { JSONObject } from "@ai-sdk/provider";
import type { ProviderOptions } from "@ai-sdk/provider-utils";
import type { EmbedManyResult } from "ai";

import type { EmbeddingsInputs, EmbeddingsData, EmbeddingsUsage, Embeddings } from "./schema";

export type EmbedCallOptions = {
  values: string[];
  providerOptions: ProviderOptions;
};

export function convertToEmbedCallOptions(params: EmbeddingsInputs): EmbedCallOptions {
  const { input, ...rest } = params;

  return {
    values: Array.isArray(input) ? input : [input],
    providerOptions: {
      unknown: rest as JSONObject,
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
    provider_metadata: embedManyResult.providerMetadata,
  };
}

export function createEmbeddingsResponse(
  embedManyResult: EmbedManyResult,
  modelId: string,
  headers?: HeadersInit,
): Response {
  return new Response(JSON.stringify(toEmbeddings(embedManyResult, modelId)), {
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}
