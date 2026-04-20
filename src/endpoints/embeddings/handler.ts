import { embedMany, wrapEmbeddingModel } from "ai";
import * as z from "zod/mini";

import { GatewayError } from "../../errors/gateway";
import { winterCgHandler } from "../../lifecycle";
import { logger } from "../../logger";
import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { resolveProvider } from "../../providers/registry";
import {
  getGenAiGeneralAttributes,
  recordTimePerOutputToken,
  recordTokenUsage,
} from "../../telemetry/gen-ai";
import { addSpanEvent, setSpanAttributes } from "../../telemetry/span";
import type {
  AfterHookContext,
  BeforeHookContext,
  GatewayConfig,
  Endpoint,
  GatewayContext,
  ResolveProviderHookContext,
  ResolveModelHookContext,
  GatewayConfigParsed,
} from "../../types";
import { parseRequestBody } from "../../utils/body";
import { prepareForwardHeaders } from "../../utils/request";
import { convertToEmbedCallOptions, toEmbeddings } from "./converters";
import { getEmbeddingsRequestAttributes, getEmbeddingsResponseAttributes } from "./otel";
import { EmbeddingsBodySchema, type EmbeddingsBody, type EmbeddingsInputs } from "./schema";

export const embeddings = (config: GatewayConfig): Endpoint => {
  const hooks = config.hooks;

  const handler = async (ctx: GatewayContext, cfg: GatewayConfigParsed) => {
    const start = performance.now();
    ctx.operation = "embeddings";
    setSpanAttributes({ "gen_ai.operation.name": ctx.operation });
    addSpanEvent("hebo.handler.started");

    // Guard: enforce HTTP method early.
    if (!ctx.request || ctx.request.method !== "POST") {
      throw new GatewayError("Method Not Allowed", 405);
    }

    // Parse + validate input (handles Content-Encoding decompression + body size limits).
    ctx.body = (await parseRequestBody(ctx.request, cfg.maxBodySize)) as typeof ctx.body;
    logger.trace({ requestId: ctx.requestId, result: ctx.body }, "[chat] EmbeddingsBody");
    addSpanEvent("hebo.request.deserialized");

    const parsed = EmbeddingsBodySchema.safeParse(ctx.body);
    if (!parsed.success) {
      // FUTURE: consider adding body shape to metadata
      throw new GatewayError(z.prettifyError(parsed.error), 400, undefined, parsed.error);
    }
    ctx.body = parsed.data;
    addSpanEvent("hebo.request.parsed");

    if (hooks?.before) {
      ctx.body = ((await hooks.before(ctx as BeforeHookContext)) as EmbeddingsBody) ?? ctx.body;
      addSpanEvent("hebo.hooks.before.completed");
    }

    // Resolve model + provider (hooks may override defaults).
    ctx.modelId = ctx.body.model;
    ctx.resolvedModelId =
      (await hooks?.resolveModelId?.(ctx as ResolveModelHookContext)) ?? ctx.modelId;
    logger.debug(`[embeddings] resolved ${ctx.modelId} to ${ctx.resolvedModelId}`);
    addSpanEvent("hebo.model.resolved");

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
    addSpanEvent("hebo.provider.resolved");

    ctx.trace ??= ctx.body.trace ?? cfg.telemetry?.signals?.gen_ai;
    const genAiGeneralAttrs = getGenAiGeneralAttributes(ctx, ctx.trace);
    setSpanAttributes(genAiGeneralAttrs);

    // Convert inputs to AI SDK call options.
    const { model: _model, trace: _trace, ...inputs } = ctx.body;
    const embedOptions = convertToEmbedCallOptions(inputs as EmbeddingsInputs);
    logger.trace(
      { requestId: ctx.requestId, options: embedOptions },
      "[embeddings] AI SDK options",
    );
    addSpanEvent("hebo.options.prepared");
    setSpanAttributes(getEmbeddingsRequestAttributes(ctx.body, ctx.trace));

    // Build middleware chain (model -> forward params -> provider).
    const embeddingModelWithMiddleware = wrapEmbeddingModel({
      model: embeddingModel,
      middleware: modelMiddlewareMatcher.forEmbedding(ctx.resolvedModelId, embeddingModel.provider),
    });

    // Execute request.
    addSpanEvent("hebo.ai-sdk.started");
    const result = await embedMany({
      model: embeddingModelWithMiddleware,
      headers: prepareForwardHeaders(ctx.request, cfg.forwardHeaders),
      abortSignal: ctx.request.signal,
      ...embedOptions,
    });
    logger.trace({ requestId: ctx.requestId, result }, "[embeddings] AI SDK result");
    addSpanEvent("hebo.ai-sdk.completed");
    if (result.responses?.[0]?.headers) ctx.response = { headers: result.responses[0].headers };

    // Transform result.
    ctx.result = toEmbeddings(result, ctx.modelId);
    logger.trace({ requestId: ctx.requestId, result: ctx.result }, "[chat] Embeddings");
    addSpanEvent("hebo.result.transformed");
    const genAiResponseAttrs = getEmbeddingsResponseAttributes(ctx.result, ctx.trace);
    recordTokenUsage(genAiResponseAttrs, genAiGeneralAttrs, ctx.trace);
    setSpanAttributes(genAiResponseAttrs);

    if (hooks?.after) {
      ctx.result = (await hooks.after(ctx as AfterHookContext)) ?? ctx.result;
      addSpanEvent("hebo.hooks.after.completed");
    }

    recordTimePerOutputToken(start, 0, genAiResponseAttrs, genAiGeneralAttrs, ctx.trace);
    return ctx.result;
  };

  return { handler: winterCgHandler(handler, config) };
};
