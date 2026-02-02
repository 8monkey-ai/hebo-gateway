import { embedMany, wrapEmbeddingModel } from "ai";
import * as z from "zod/mini";

import type { GatewayConfig, Endpoint, GatewayContext } from "../../types";

import { withLifecycle } from "../../lifecycle";
import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { resolveProvider } from "../../providers/registry";
import { createErrorResponse } from "../../utils/errors";
import { convertToEmbedCallOptions, createEmbeddingsResponse } from "./converters";
import { EmbeddingsBodySchema } from "./schema";

export const embeddings = (config: GatewayConfig): Endpoint => {
  const hooks = config.hooks;

  const handler = async (ctx: GatewayContext): Promise<Response> => {
    if (!ctx.request || ctx.request.method !== "POST") {
      return createErrorResponse("METHOD_NOT_ALLOWED", "Method Not Allowed", 405);
    }

    let body;
    try {
      body = await ctx.request.json();
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
    ctx.body = parsed.data;

    let inputs;
    ({ model: ctx.modelId, ...inputs } = parsed.data);

    try {
      ctx.resolvedModelId = (await hooks?.resolveModelId?.(ctx)) ?? ctx.modelId;
    } catch (error) {
      return createErrorResponse("BAD_REQUEST", error, 400);
    }

    ctx.operation = "embeddings";
    try {
      const override = await hooks?.resolveProvider?.(ctx);
      ctx.provider =
        override ??
        resolveProvider({
          providers: ctx.providers,
          models: ctx.models,
          modelId: ctx.resolvedModelId,
          operation: ctx.operation,
        });
    } catch (error) {
      return createErrorResponse("BAD_REQUEST", error, 400);
    }

    const embeddingModel = ctx.provider.embeddingModel(ctx.resolvedModelId);

    let embedOptions;
    try {
      embedOptions = convertToEmbedCallOptions(inputs);
    } catch (error) {
      return createErrorResponse("BAD_REQUEST", error, 400);
    }

    const embeddingModelWithMiddleware = wrapEmbeddingModel({
      model: embeddingModel,
      middleware: modelMiddlewareMatcher.forEmbedding(ctx.resolvedModelId, embeddingModel.provider),
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

    return createEmbeddingsResponse(result, ctx.modelId);
  };

  return { handler: withLifecycle(handler, config) };
};
