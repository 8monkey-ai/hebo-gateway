import {
  generateText,
  Output,
  streamText,
  wrapLanguageModel,
  type GenerateTextResult,
  type ToolSet,
} from "ai";
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
import { recordRequestDuration, recordTokenUsage } from "../../telemetry/gen-ai";
import { addSpanEvent, setSpanAttributes } from "../../telemetry/span";
import { resolveRequestId } from "../../utils/headers";
import { prepareForwardHeaders } from "../../utils/request";
import { convertToTextCallOptions, toChatCompletions, toChatCompletionsStream } from "./converters";
import {
  getChatGeneralAttributes,
  getChatRequestAttributes,
  getChatResponseAttributes,
} from "./otel";
import { ChatCompletionsBodySchema } from "./schema";

export const chatCompletions = (config: GatewayConfig): Endpoint => {
  const hooks = config.hooks;

  const handler = async (ctx: GatewayContext) => {
    const start = performance.now();
    ctx.operation = "chat";
    addSpanEvent("hebo.handler.started");

    // Guard: enforce HTTP method early.
    if (!ctx.request || ctx.request.method !== "POST") {
      throw new GatewayError("Method Not Allowed", 405);
    }

    const requestId = resolveRequestId(ctx.request);

    // Parse + validate input.
    try {
      ctx.body = await ctx.request.json();
    } catch {
      throw new GatewayError("Invalid JSON", 400);
    }
    addSpanEvent("hebo.request.deserialized");

    const parsed = ChatCompletionsBodySchema.safeParse(ctx.body);
    if (!parsed.success) {
      // FUTURE: add body shape to error message
      throw new GatewayError(z.prettifyError(parsed.error), 400);
    }
    ctx.body = parsed.data;
    addSpanEvent("hebo.request.parsed");

    if (hooks?.before) {
      ctx.body = (await hooks.before(ctx as BeforeHookContext)) ?? ctx.body;
      addSpanEvent("hebo.hooks.before.completed");
    }

    // Resolve model + provider (hooks may override defaults).
    let inputs, stream;
    ({ model: ctx.modelId, stream, ...inputs } = ctx.body);

    ctx.resolvedModelId =
      (await hooks?.resolveModelId?.(ctx as ResolveModelHookContext)) ?? ctx.modelId;
    logger.debug(`[chat] resolved ${ctx.modelId} to ${ctx.resolvedModelId}`);
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

    const languageModel = ctx.provider.languageModel(ctx.resolvedModelId);
    ctx.resolvedProviderId = languageModel.provider;
    logger.debug(`[chat] using ${languageModel.provider} for ${ctx.resolvedModelId}`);
    addSpanEvent("hebo.provider.resolved");

    const genAiSignalLevel = config.telemetry?.signals?.gen_ai;
    const genAiGeneralAttrs = getChatGeneralAttributes(ctx, genAiSignalLevel);
    setSpanAttributes(genAiGeneralAttrs);

    // Convert inputs to AI SDK call options.
    const textOptions = convertToTextCallOptions(inputs);
    logger.trace(
      {
        requestId,
        options: textOptions,
      },
      "[chat] AI SDK options",
    );
    addSpanEvent("hebo.options.prepared");
    setSpanAttributes(getChatRequestAttributes(inputs, genAiSignalLevel));

    // Build middleware chain (model -> forward params -> provider).
    const languageModelWithMiddleware = wrapLanguageModel({
      model: languageModel,
      middleware: modelMiddlewareMatcher.for(ctx.resolvedModelId, languageModel.provider),
    });

    // Execute request (streaming vs. non-streaming).
    if (stream) {
      addSpanEvent("hebo.ai-sdk.started");
      const result = streamText({
        model: languageModelWithMiddleware,
        headers: prepareForwardHeaders(ctx.request),
        // No abort signal here, otherwise we can't detect upstream from client cancellations
        // abortSignal: ctx.request.signal,
        timeout: {
          totalMs: 5 * 60 * 1000,
        },
        onAbort: () => {
          throw new DOMException("Upstream failed", "AbortError");
        },
        onError: ({ error }) => {
          throw error;
        },
        onFinish: (result) => {
          addSpanEvent("hebo.ai-sdk.completed");
          const streamResult = toChatCompletions(
            result as unknown as GenerateTextResult<ToolSet, Output.Output>,
            ctx.resolvedModelId!,
          );
          addSpanEvent("hebo.result.transformed");

          const genAiResponseAttrs = getChatResponseAttributes(streamResult, genAiSignalLevel);
          setSpanAttributes(genAiResponseAttrs);
          recordTokenUsage(genAiResponseAttrs, genAiGeneralAttrs, genAiSignalLevel);
          recordRequestDuration(performance.now() - start, genAiGeneralAttrs, genAiSignalLevel);
        },
        experimental_include: {
          requestBody: false,
        },
        includeRawChunks: false,
        ...textOptions,
      });

      ctx.result = toChatCompletionsStream(result, ctx.resolvedModelId);

      if (hooks?.after) {
        ctx.result = (await hooks.after(ctx as AfterHookContext)) ?? ctx.result;
        addSpanEvent("hebo.hooks.after.completed");
      }

      return ctx.result;
    }

    addSpanEvent("hebo.ai-sdk.started");
    const result = await generateText({
      model: languageModelWithMiddleware,
      headers: prepareForwardHeaders(ctx.request),
      // FUTURE: currently can't tell whether upstream or downstream abort
      abortSignal: ctx.request.signal,
      timeout: 5 * 60 * 1000,
      experimental_include: {
        requestBody: false,
        responseBody: false,
      },
      ...textOptions,
    });
    logger.trace({ requestId, result }, "[chat] AI SDK result");
    addSpanEvent("hebo.ai-sdk.completed");

    // Transform result.
    ctx.result = toChatCompletions(result, ctx.resolvedModelId);
    addSpanEvent("hebo.result.transformed");

    const genAiResponseAttrs = getChatResponseAttributes(ctx.result, genAiSignalLevel);
    setSpanAttributes(genAiResponseAttrs);
    recordTokenUsage(genAiResponseAttrs, genAiGeneralAttrs, genAiSignalLevel);

    if (hooks?.after) {
      ctx.result = (await hooks.after(ctx as AfterHookContext)) ?? ctx.result;
      addSpanEvent("hebo.hooks.after.completed");
    }

    recordRequestDuration(performance.now() - start, genAiGeneralAttrs, genAiSignalLevel);
    return ctx.result;
  };

  return { handler: winterCgHandler(handler, config) };
};
