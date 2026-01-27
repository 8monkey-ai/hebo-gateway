import type { ProviderOptions } from "@ai-sdk/provider-utils";
import type { EmbedManyResult } from "ai";

import type {
  OpenAICompatibleEmbedding,
  OpenAICompatibleEmbeddingParams,
  OpenAICompatibleEmbeddingResponseBody,
  OpenAICompatibleEmbeddingUsage,
} from "./schema";

export type VercelAIEmbeddingsModelParams = {
  values: string[];
  providerOptions: ProviderOptions;
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
    providerOptions: {
      openAICompat: rest,
    },
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

export function toOpenAICompatibleEmbeddingResponse(
  embedManyResult: EmbedManyResult,
  modelId: string,
): Response {
  return new Response(
    JSON.stringify(toOpenAICompatibleEmbeddingResponseBody(embedManyResult, modelId)),
    {
      headers: { "Content-Type": "application/json" },
    },
  );
}
