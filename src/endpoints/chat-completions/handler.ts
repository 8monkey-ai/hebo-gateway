import { generateText, streamText, wrapLanguageModel } from "ai";
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
import { convertToTextCallOptions, toChatCompletions, toChatCompletionsStream } from "./converters";
import { ChatCompletionsBodySchema } from "./schema";

export const chatCompletions = (config: GatewayConfig): Endpoint => {
  const hooks = config.hooks;

  const handler = async (ctx: GatewayContext) => {
    addSpanEvent("lifecycle.handler.started");

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
    addSpanEvent("lifecycle.request.deserialized");

    const parsed = ChatCompletionsBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new GatewayError(z.prettifyError(parsed.error), 400);
    }
    ctx.body = parsed.data;
    addSpanEvent("lifecycle.request.parsed");

    ctx.operation = "chat";
    if (hooks?.before) {
      ctx.body = (await hooks.before(ctx as BeforeHookContext)) ?? ctx.body;
      addSpanEvent("lifecycle.hooks.before.completed");
    }

    // Resolve model + provider (hooks may override defaults).
    let inputs, stream;
    ({ model: ctx.modelId, stream, ...inputs } = ctx.body);

    ctx.resolvedModelId =
      (await hooks?.resolveModelId?.(ctx as ResolveModelHookContext)) ?? ctx.modelId;
    logger.debug(`[chat] resolved ${ctx.modelId} to ${ctx.resolvedModelId}`);
    addSpanEvent("lifecycle.model.resolved", {
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

    const languageModel = ctx.provider.languageModel(ctx.resolvedModelId);
    ctx.resolvedProviderId = languageModel.provider;
    logger.debug(`[chat] using ${languageModel.provider} for ${ctx.resolvedModelId}`);
    addSpanEvent("lifecycle.provider.resolved", { "gen_ai.provider.name": ctx.resolvedProviderId });

    // Convert inputs to AI SDK call options.
    const textOptions = convertToTextCallOptions(inputs);
    logger.trace(
      {
        requestId,
        options: textOptions,
      },
      "[chat] AI SDK options",
    );
    addSpanEvent("lifecycle.options.prepared");

    // Build middleware chain (model -> forward params -> provider).
    const languageModelWithMiddleware = wrapLanguageModel({
      model: languageModel,
      middleware: modelMiddlewareMatcher.for(ctx.resolvedModelId, languageModel.provider),
    });

    // Execute request (streaming vs. non-streaming).
    if (stream) {
      addSpanEvent("lifecycle.ai-sdk.started");
      const result = streamText({
        model: languageModelWithMiddleware,
        headers: prepareForwardHeaders(ctx.request),
        // No abort signal here, otherwise we can't detect upstream from client cancellations
        // abortSignal: ctx.request.signal,
        onError: ({ error }) => {
          const err = error instanceof Error ? error : new Error(String(error));
          logger.error({
            requestId,
            err,
          });
          throw error;
        },
        onAbort: () => {
          throw new DOMException("Upstream failed", "AbortError");
        },
        timeout: {
          totalMs: 5 * 60 * 1000,
        },
        experimental_include: {
          requestBody: false,
        },
        includeRawChunks: false,
        ...textOptions,
      });
      addSpanEvent("lifecycle.ai-sdk.completed");

      ctx.result = toChatCompletionsStream(result, ctx.modelId);
      addSpanEvent("lifecycle.result.transformed");

      if (hooks?.after) {
        ctx.result = (await hooks.after(ctx as AfterHookContext)) ?? ctx.result;
        addSpanEvent("lifecycle.hooks.after.completed");
      }

      return ctx.result;
    }

    addSpanEvent("lifecycle.ai-sdk.started");
    const result = await generateText({
      model: languageModelWithMiddleware,
      headers: prepareForwardHeaders(ctx.request),
      // FUTURE: currently can't tell whether upstream or downstream abort
      abortSignal: ctx.request.signal,
      experimental_include: {
        requestBody: false,
        responseBody: false,
      },
      timeout: 5 * 60 * 1000,
      ...textOptions,
    });
    logger.trace({ requestId, result }, "[chat] AI SDK result");
    addSpanEvent("lifecycle.ai-sdk.completed");

    ctx.result = toChatCompletions(result, ctx.modelId);
    addSpanEvent("lifecycle.result.transformed");

    if (hooks?.after) {
      ctx.result = (await hooks.after(ctx as AfterHookContext)) ?? ctx.result;
      addSpanEvent("lifecycle.hooks.after.completed");
    }

    return ctx.result;
  };

  return { handler: winterCgHandler(handler, config) };
};
