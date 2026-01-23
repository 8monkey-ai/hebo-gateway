import type { ProviderRegistryProvider } from "ai";

import { embedMany } from "ai";
import * as z from "zod/mini";

import type { ModelCatalog } from "../../models/types";
import type { Endpoint } from "./types";

import { resolveProvider } from "../../providers/utils";
import { createErrorResponse } from "../../utils/errors";
import { toOpenAICompatibleEmbeddingResponseBody } from "./converters";
import {
  OpenAICompatibleEmbeddingRequestBodySchema,
  type OpenAICompatibleEmbeddingResponseBody,
} from "./schema";

export const embeddings = (
  providers?: ProviderRegistryProvider,
  models: ModelCatalog = {},
): Endpoint => ({
  handler: (async (req: Request): Promise<Response> => {
    if (req.method !== "POST") {
      return createErrorResponse("METHOD_NOT_ALLOWED", "Method Not Allowed", 405);
    }

    let json;
    try {
      json = await req.json();
    } catch {
      return createErrorResponse("BAD_REQUEST", "Invalid JSON", 400);
    }

    const parsed = OpenAICompatibleEmbeddingRequestBodySchema.safeParse(json);

    if (!parsed.success) {
      return createErrorResponse(
        "UNPROCESSABLE_ENTITY",
        "Validation error",
        422,
        z.prettifyError(parsed.error),
      );
    }

    const requestBody = parsed.data;
    const { input, model: modelId, ...rest } = requestBody;

    let provider;
    try {
      provider = resolveProvider(providers!, models, modelId, "embeddings");
    } catch (error) {
      return createErrorResponse("BAD_REQUEST", error.message, 400);
    }

    const embeddingModel = provider.embeddingModel(modelId);

    const providerOptions = {
      [embeddingModel.provider]: rest,
    };

    let embedManyResult;
    try {
      const inputs = Array.isArray(input) ? input : [input];
      embedManyResult = await embedMany({
        model: embeddingModel,
        values: inputs,
        providerOptions,
      });
    } catch (error) {
      const errorMessage = error.message || "Failed to generate embeddings";
      return createErrorResponse("INTERNAL_SERVER_ERROR", errorMessage, 500);
    }

    const openAICompatibleResponse: OpenAICompatibleEmbeddingResponseBody =
      toOpenAICompatibleEmbeddingResponseBody(embedManyResult, modelId);

    const finalResponse = new Response(JSON.stringify(openAICompatibleResponse), {
      headers: { "Content-Type": "application/json" },
    });

    return finalResponse;
  }) as typeof fetch,
});
