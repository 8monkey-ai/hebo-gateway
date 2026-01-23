import { embedMany } from "ai";
import * as z from "zod/mini";

import type { GatewayConfig, Endpoint } from "../../types";

import { resolveProvider } from "../../providers/registry";
import { createErrorResponse } from "../../utils/errors";
import {
  convertToEmbeddingsModelParams,
  toOpenAICompatibleEmbeddingResponseBody,
} from "./converters";
import {
  OpenAICompatibleEmbeddingRequestBodySchema,
  type OpenAICompatibleEmbeddingResponseBody,
} from "./schema";

export const embeddings = (config: GatewayConfig): Endpoint => {
  const { providers, models } = config;

  return {
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
      const { model: modelId, ...params } = requestBody;

      let provider;
      try {
        provider = resolveProvider(providers, models, modelId, "embeddings");
      } catch (error) {
        return createErrorResponse("BAD_REQUEST", error.message, 400);
      }

      const embeddingModel = provider.embeddingModel(modelId);

      const { values, providerOptions: rawOptions } = convertToEmbeddingsModelParams(params);

      const providerOptions = {
        [embeddingModel.provider]: rawOptions,
      };

      let embedManyResult;
      try {
        embedManyResult = await embedMany({
          model: embeddingModel,
          values,
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
  };
};
