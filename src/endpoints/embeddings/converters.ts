import type { JSONObject, SharedV3ProviderOptions } from "@ai-sdk/provider";
import type { EmbedManyResult } from "ai";

import type { EmbeddingsInputs, EmbeddingsData, EmbeddingsUsage, Embeddings } from "./schema";

import { toResponse } from "../../utils/response";

export type EmbedCallOptions = {
  values: string[];
  providerOptions: SharedV3ProviderOptions;
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
    prompt_tokens: embedManyResult.usage.tokens,
    total_tokens: embedManyResult.usage.tokens,
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
  responseInit?: ResponseInit,
): Response {
  return toResponse(toEmbeddings(embedManyResult, modelId), responseInit);
}
