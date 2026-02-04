import { embedMany, wrapEmbeddingModel } from "ai";
import * as z from "zod/mini";

import type {
  GatewayConfig,
  Endpoint,
  GatewayContext,
  ResolveProviderHookContext,
  ResolveModelHookContext,
} from "../../types";

import { withLifecycle } from "../../lifecycle";
import { forwardParamsEmbeddingMiddleware } from "../../middleware/common";
import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { resolveProvider } from "../../providers/registry";
import { GatewayError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import { convertToEmbedCallOptions, createEmbeddingsResponse } from "./converters";
import { EmbeddingsBodySchema } from "./schema";

export const embeddings = (config: GatewayConfig): Endpoint => {
  const hooks = config.hooks;

  const handler = async (ctx: GatewayContext): Promise<Response> => {
    // Guard: enforce HTTP method early.
    if (!ctx.request || ctx.request.method !== "POST") {
      throw new GatewayError("Method Not Allowed", "METHOD_NOT_ALLOWED", 405);
    }

    // Parse + validate input.
    let body;
    try {
      body = await ctx.request.json();
    } catch {
      throw new GatewayError("Invalid JSON", "BAD_REQUEST", 400, "body");
    }

    const parsed = EmbeddingsBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new GatewayError(
        "Validation error",
        "UNPROCESSABLE_ENTITY",
        400,
        z.prettifyError(parsed.error),
      );
    }
    ctx.body = parsed.data;

    // Resolve model + provider (hooks may override defaults).
    let inputs;
    ({ model: ctx.modelId, ...inputs } = parsed.data);

    ctx.resolvedModelId =
      (await hooks?.resolveModelId?.(ctx as ResolveModelHookContext)) ?? ctx.modelId;
    logger.debug(`[embeddings] model resolved: ${ctx.modelId} -> ${ctx.resolvedModelId}`);

    ctx.operation = "embeddings";
    const override = await hooks?.resolveProvider?.(ctx as ResolveProviderHookContext);
    ctx.provider =
      override ??
      resolveProvider({
        providers: ctx.providers,
        models: ctx.models,
        modelId: ctx.resolvedModelId,
        operation: ctx.operation,
      });

    const embeddingModel = ctx.provider.embeddingModel(ctx.resolvedModelId);
    logger.debug(
      `[embeddings] provider resolved: ${ctx.resolvedModelId} -> ${embeddingModel.provider}`,
    );

    // Convert inputs to AI SDK call options.
    const embedOptions = convertToEmbedCallOptions(inputs);

    // Build middleware chain (model -> forward params -> provider).
    const middleware = [];
    for (const m of modelMiddlewareMatcher.forEmbeddingModel(ctx.resolvedModelId))
      middleware.push(m);
    middleware.push(forwardParamsEmbeddingMiddleware(embeddingModel.provider));
    for (const m of modelMiddlewareMatcher.forEmbeddingProvider(embeddingModel.provider))
      middleware.push(m);

    const embeddingModelWithMiddleware = wrapEmbeddingModel({
      model: embeddingModel,
      middleware,
    });

    // Execute request.
    const result = await embedMany({
      model: embeddingModelWithMiddleware,
      ...embedOptions,
    });

    return createEmbeddingsResponse(result, ctx.modelId);
  };

  return { handler: withLifecycle(handler, config) };
};
