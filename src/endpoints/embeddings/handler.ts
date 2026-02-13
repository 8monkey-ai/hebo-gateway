import { embedMany, wrapEmbeddingModel } from "ai";
import * as z from "zod/mini";

import type {
  AfterHookContext,
  BeforeHookContext,
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
import { addSpanEvent } from "../../telemetry/span";
import { resolveRequestId } from "../../utils/headers";
import { prepareForwardHeaders } from "../../utils/request";
import { convertToEmbedCallOptions, toEmbeddings } from "./converters";
import { EmbeddingsBodySchema } from "./schema";

export const embeddings = (config: GatewayConfig): Endpoint => {
  const hooks = config.hooks;

  const handler = async (ctx: GatewayContext) => {
    addSpanEvent("embeddings.handler.started");

    // Guard: enforce HTTP method early.
    if (!ctx.request || ctx.request.method !== "POST") {
      throw new GatewayError("Method Not Allowed", 405);
    }

    const requestId = resolveRequestId(ctx.request);

    // Parse + validate input.
    let body;
    try {
      body = await ctx.request.json();
    } catch {
      throw new GatewayError("Invalid JSON", 400);
    }
    addSpanEvent("embeddings.request.deserialized");

    const parsed = EmbeddingsBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new GatewayError(z.prettifyError(parsed.error), 400);
    }
    ctx.body = parsed.data;
    addSpanEvent("embeddings.request.parsed");

    ctx.operation = "embeddings";
    if (hooks?.before) {
      ctx.body = (await hooks.before(ctx as BeforeHookContext)) ?? ctx.body;
      addSpanEvent("embeddings.hooks.before.completed");
    }

    // Resolve model + provider (hooks may override defaults).
    let inputs;
    ({ model: ctx.modelId, ...inputs } = ctx.body);

    ctx.resolvedModelId =
      (await hooks?.resolveModelId?.(ctx as ResolveModelHookContext)) ?? ctx.modelId;
    logger.debug(`[embeddings] resolved ${ctx.modelId} to ${ctx.resolvedModelId}`);
    addSpanEvent("embeddings.model.resolved", {
      "gen_ai.request.model": ctx.modelId ?? "",
      "gen_ai.response.model": ctx.resolvedModelId ?? "",
    });

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
    addSpanEvent("embeddings.provider.resolved", {
      "gen_ai.provider.name": ctx.resolvedProviderId,
    });

    // Convert inputs to AI SDK call options.
    const embedOptions = convertToEmbedCallOptions(inputs);
    logger.trace({ requestId, options: embedOptions }, "[embeddings] AI SDK options");
    addSpanEvent("embeddings.options.prepared");

    // Build middleware chain (model -> forward params -> provider).
    const embeddingModelWithMiddleware = wrapEmbeddingModel({
      model: embeddingModel,
      middleware: modelMiddlewareMatcher.forEmbedding(ctx.resolvedModelId, embeddingModel.provider),
    });

    // Execute request.
    addSpanEvent("embeddings.ai-sdk.started");
    const result = await embedMany({
      model: embeddingModelWithMiddleware,
      headers: prepareForwardHeaders(ctx.request),
      abortSignal: ctx.request.signal,
      ...embedOptions,
    });
    logger.trace({ requestId, result }, "[embeddings] AI SDK result");
    addSpanEvent("embeddings.ai-sdk.completed");

    ctx.result = toEmbeddings(result, ctx.modelId);
    addSpanEvent("embeddings.result.transformed");

    if (hooks?.after) {
      ctx.result = (await hooks.after(ctx as AfterHookContext)) ?? ctx.result;
      addSpanEvent("embeddings.hooks.after.completed");
    }

    return ctx.result;
  };

  return { handler: winterCgHandler(handler, config) };
};
