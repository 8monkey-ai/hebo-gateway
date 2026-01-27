import type { ProviderOptions } from "@ai-sdk/provider-utils";
import type { EmbedManyResult } from "ai";

import type {
  OpenAICompatEmbeddingsOptions,
  OpenAICompatEmbeddings,
  OpenAICompatEmbeddingsData,
  OpenAICompatEmbeddingsUsage,
} from "./schema";

export type EmbedCallOptions = {
  values: string[];
  providerOptions: ProviderOptions;
};

function fromOpenAICompatEmbeddingsInput(input: string | string[]): string[] {
  return Array.isArray(input) ? input : [input];
}

export function parseOpenAICompatEmbeddingsOptions(
  params: OpenAICompatEmbeddingsOptions,
): EmbedCallOptions {
  const { input, ...rest } = params;
  const values = fromOpenAICompatEmbeddingsInput(input);

  return {
    values,
    providerOptions: {
      openAICompat: rest,
    },
  };
}

export function toOpenAICompatEmbeddings(
  embedManyResult: EmbedManyResult,
  modelId: string,
): OpenAICompatEmbeddings {
  const data: OpenAICompatEmbeddingsData[] = embedManyResult.embeddings.map((embedding, index) => ({
    object: "embedding",
    embedding,
    index,
  }));

  const usage: OpenAICompatEmbeddingsUsage = {
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

export function createOpenAICompatEmbeddingsResponse(
  embedManyResult: EmbedManyResult,
  modelId: string,
): Response {
  return new Response(JSON.stringify(toOpenAICompatEmbeddings(embedManyResult, modelId)), {
    headers: { "Content-Type": "application/json" },
  });
}
