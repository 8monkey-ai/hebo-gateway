import { embedMany, wrapEmbeddingModel } from "ai";
import * as z from "zod/mini";

import type { GatewayConfig, Endpoint } from "../../types";

import { parseConfig } from "../../config";
import { modelMiddlewareMatcher } from "../../model-middleware";
import { resolveProvider } from "../../providers/registry";
import { createErrorResponse } from "../../utils/errors";
import { withHooks } from "../../utils/hooks";
import { convertToEmbedCallOptions, createEmbeddingsResponse } from "./converters";
import { EmbeddingsBodySchema } from "./schema";

export const embeddings = (config: GatewayConfig): Endpoint => {
  const { providers, models, hooks } = parseConfig(config);

  const handler = async (req: Request): Promise<Response> => {
    if (req.method !== "POST") {
      return createErrorResponse("METHOD_NOT_ALLOWED", "Method Not Allowed", 405);
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return createErrorResponse("BAD_REQUEST", "Invalid JSON", 400);
    }

    const parsed = EmbeddingsBodySchema.safeParse(body);

    if (!parsed.success) {
      return createErrorResponse(
        "UNPROCESSABLE_ENTITY",
        "Validation error",
        422,
        z.prettifyError(parsed.error),
      );
    }

    const { model: modelId, ...inputs } = parsed.data;

    let resolvedModelId;
    try {
      resolvedModelId = (await hooks?.resolveModelId?.({ modelId })) ?? modelId;
    } catch (error) {
      return createErrorResponse("BAD_REQUEST", error, 400);
    }

    let embedOptions;
    try {
      embedOptions = convertToEmbedCallOptions(inputs);
    } catch (error) {
      return createErrorResponse("BAD_REQUEST", error, 400);
    }

    let provider;
    try {
      const args = {
        providers,
        models,
        modelId: resolvedModelId,
        operation: "embeddings" as const,
      };
      const override = await hooks?.resolveProvider?.(args);
      provider = override ?? resolveProvider(args);
    } catch (error) {
      return createErrorResponse("BAD_REQUEST", error, 400);
    }

    const embeddingModel = provider.embeddingModel(resolvedModelId);

    const embeddingModelWithMiddleware = wrapEmbeddingModel({
      model: embeddingModel,
      middleware: modelMiddlewareMatcher.forEmbedding(resolvedModelId, embeddingModel.provider),
    });

    let result;
    try {
      result = await embedMany({
        model: embeddingModelWithMiddleware,
        ...embedOptions,
      });
    } catch (error) {
      return createErrorResponse("INTERNAL_SERVER_ERROR", error, 500);
    }

    return createEmbeddingsResponse(result, modelId);
  };

  return { handler: withHooks(hooks, handler) };
};
