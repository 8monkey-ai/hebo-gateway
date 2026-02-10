import { embedMany, wrapEmbeddingModel } from "ai";
import * as z from "zod/mini";

import type {
  GatewayConfig,
  Endpoint,
  GatewayContext,
  ResolveProviderHookContext,
  ResolveModelHookContext,
} from "../../types";

import { GatewayError } from "../../errors/gateway";
import { winterCgHandler } from "../../lifecycle";
import { logger } from "../../logger";
import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { resolveProvider } from "../../providers/registry";
import { markPerf } from "../../telemetry/perf";
import { prepareForwardHeaders } from "../../utils/request";
import { convertToEmbedCallOptions, toEmbeddings } from "./converters";
import { EmbeddingsBodySchema } from "./schema";

export const embeddings = (config: GatewayConfig): Endpoint => {
  const hooks = config.hooks;

  const handler = async (ctx: GatewayContext) => {
    // Guard: enforce HTTP method early.
    if (!ctx.request || ctx.request.method !== "POST") {
      throw new GatewayError("Method Not Allowed", 405);
    }

    // Parse + validate input.
    let body;
    try {
      body = await ctx.request.json();
    } catch {
      throw new GatewayError("Invalid JSON", 400);
    }

    const parsed = EmbeddingsBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new GatewayError(z.prettifyError(parsed.error), 400);
    }
    ctx.body = parsed.data;

    // Resolve model + provider (hooks may override defaults).
    let inputs;
    ({ model: ctx.modelId, ...inputs } = parsed.data);

    ctx.resolvedModelId =
      (await hooks?.resolveModelId?.(ctx as ResolveModelHookContext)) ?? ctx.modelId;
    logger.debug(`[embeddings] resolved ${ctx.modelId} to ${ctx.resolvedModelId}`);

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
    ctx.resolvedProviderId = embeddingModel.provider;
    logger.debug(`[embeddings] using ${embeddingModel.provider} for ${ctx.resolvedModelId}`);

    // Convert inputs to AI SDK call options.
    const embedOptions = convertToEmbedCallOptions(inputs);
    logger.trace(
      { requestId: ctx.request.headers.get("x-request-id"), options: embedOptions },
      "[embeddings] AI SDK options",
    );

    // Build middleware chain (model -> forward params -> provider).
    const embeddingModelWithMiddleware = wrapEmbeddingModel({
      model: embeddingModel,
      middleware: modelMiddlewareMatcher.forEmbedding(ctx.resolvedModelId, embeddingModel.provider),
    });

    // Execute request.
    markPerf(ctx.request, "aiSdkStart");
    const result = await embedMany({
      model: embeddingModelWithMiddleware,
      headers: prepareForwardHeaders(ctx.request),
      abortSignal: ctx.request.signal,
      ...embedOptions,
    });
    markPerf(ctx.request, "aiSdkEnd");

    logger.trace(
      { requestId: ctx.request.headers.get("x-request-id"), result },
      "[embeddings] AI SDK result",
    );

    return toEmbeddings(result, ctx.modelId);
  };

  return { handler: winterCgHandler(handler, config) };
};
