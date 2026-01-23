import type { ProviderRegistryProvider } from "ai";

import { embedMany } from "ai";
import * as z from "zod/mini";

import type { ModelCatalog } from "../../models/types";
import type { Endpoint } from "./types";

import { resolveModelId } from "../../models/catalog";
import { createErrorResponse } from "../errors";
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
    const { input, model, ...rest } = requestBody;

    let resolvedProvider;
    let resolvedModelId;

    try {
      ({ resolvedProvider, resolvedModelId } = resolveModelId(models, model, "embeddings"));
    } catch (e: any) {
      return createErrorResponse("BAD_REQUEST", e.message, 400);
    }

    let embeddingModel;
    try {
      embeddingModel = providers.embeddingModel(resolvedModelId as `${string}:${string}`);
    } catch {
      return createErrorResponse(
        "BAD_REQUEST",
        `Model '${model}' not supported by ${resolvedProvider}`,
        400,
      );
    }

    const providerOptions = {
      [resolvedProvider]: rest,
    };

    let embedManyResult;
    try {
      const inputs = Array.isArray(input) ? input : [input];
      embedManyResult = await embedMany({
        model: embeddingModel,
        values: inputs,
        providerOptions,
      });
    } catch (error: any) {
      const errorMessage = error.message || "Failed to generate embeddings";
      return createErrorResponse("INTERNAL_SERVER_ERROR", errorMessage, 500);
    }

    const openAICompatibleResponse: OpenAICompatibleEmbeddingResponseBody =
      toOpenAICompatibleEmbeddingResponseBody(embedManyResult, model);

    const finalResponse = new Response(JSON.stringify(openAICompatibleResponse), {
      headers: { "Content-Type": "application/json" },
    });

    return finalResponse;
  }) as typeof fetch,
});
