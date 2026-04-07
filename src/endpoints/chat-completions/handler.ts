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
  GatewayConfigParsed,
} from "../../types";

import { GatewayError } from "../../errors/gateway";
import { winterCgHandler } from "../../lifecycle";
import { logger } from "../../logger";
import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { resolveProvider } from "../../providers/registry";
import {
  getGenAiGeneralAttributes,
  recordTimePerOutputToken,
  recordTimeToFirstToken,
  recordTokenUsage,
} from "../../telemetry/gen-ai";
import { addSpanEvent, setSpanAttributes } from "../../telemetry/span";
import { prepareForwardHeaders } from "../../utils/request";
import { convertToTextCallOptions, toChatCompletions, toChatCompletionsStream } from "./converters";
import { getChatRequestAttributes, getChatResponseAttributes } from "./otel";
import {
  ChatCompletionsBodySchema,
  type ChatCompletionsBody,
  type ChatCompletionsInputs,
} from "./schema";

export const chatCompletions = (config: GatewayConfig): Endpoint => {
  const hooks = config.hooks;

  const handler = async (ctx: GatewayContext, cfg: GatewayConfigParsed) => {
    const start = performance.now();
    ctx.operation = "chat";
    setSpanAttributes({ "gen_ai.operation.name": ctx.operation });
    addSpanEvent("hebo.handler.started");

    // Guard: enforce HTTP method early.
    if (!ctx.request || ctx.request.method !== "POST") {
      throw new GatewayError("Method Not Allowed", 405);
    }

    // Parse + validate input.
    try {
      // oxlint-disable-next-line no-unsafe-assignment
      ctx.body = await ctx.request.json();
    } catch {
      throw new GatewayError("Invalid JSON", 400);
    }
    logger.trace({ requestId: ctx.requestId, body: ctx.body }, "[chat] ChatCompletionsBody");
    addSpanEvent("hebo.request.deserialized");

    const parsed = ChatCompletionsBodySchema.safeParse(ctx.body);
    if (!parsed.success) {
      // FUTURE: consider adding body shape to metadata
      throw new GatewayError(z.prettifyError(parsed.error), 400, undefined, parsed.error);
    }
    ctx.body = parsed.data;
    addSpanEvent("hebo.request.parsed");

    if (hooks?.before) {
      ctx.body =
        ((await hooks.before(ctx as BeforeHookContext)) as ChatCompletionsBody) ?? ctx.body;
      addSpanEvent("hebo.hooks.before.completed");
    }

    // Resolve model + provider (hooks may override defaults).
    ctx.modelId = ctx.body.model;
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

    const genAiSignalLevel = cfg.telemetry?.signals?.gen_ai;
    const genAiGeneralAttrs = getGenAiGeneralAttributes(ctx, genAiSignalLevel);
    setSpanAttributes(genAiGeneralAttrs);

    // Convert inputs to AI SDK call options.
    const { model: _model, stream, ...inputs } = ctx.body;
    const textOptions = convertToTextCallOptions(inputs as ChatCompletionsInputs);
    logger.trace(
      {
        requestId: ctx.requestId,
        options: textOptions,
      },
      "[chat] AI SDK options",
    );
    addSpanEvent("hebo.options.prepared");
    setSpanAttributes(getChatRequestAttributes(ctx.body, genAiSignalLevel));

    // Build middleware chain (model -> forward params -> provider).
    const languageModelWithMiddleware = wrapLanguageModel({
      model: languageModel,
      middleware: modelMiddlewareMatcher.for(ctx.resolvedModelId, languageModel.provider),
    });

    // Execute request (streaming vs. non-streaming).
    if (stream) {
      addSpanEvent("hebo.ai-sdk.started");
      let ttftRecorded = false;
      const result = streamText({
        model: languageModelWithMiddleware,
        headers: prepareForwardHeaders(ctx.request),
        abortSignal: ctx.request.signal,
        timeout: {
          totalMs: ctx.body.service_tier === "flex" ? cfg.timeouts.flex : cfg.timeouts.normal,
        },
        onAbort: () => {
          throw new DOMException("The operation was aborted.", "AbortError");
        },
        onError: () => {},
        onChunk: () => {
          if (!ttftRecorded) {
            ttftRecorded = true;
            recordTimeToFirstToken(performance.now() - start, genAiGeneralAttrs, genAiSignalLevel);
          }
        },
        onFinish: (res) => {
          addSpanEvent("hebo.ai-sdk.completed");
          const streamResult = toChatCompletions(
            res as unknown as GenerateTextResult<ToolSet, Output.Output>,
            ctx.resolvedModelId!,
          );
          logger.trace(
            { requestId: ctx.requestId, result: streamResult },
            "[chat] ChatCompletions",
          );
          addSpanEvent("hebo.result.transformed");

          const genAiResponseAttrs = getChatResponseAttributes(streamResult, genAiSignalLevel);
          setSpanAttributes(genAiResponseAttrs);
          recordTokenUsage(genAiResponseAttrs, genAiGeneralAttrs, genAiSignalLevel);
          recordTimePerOutputToken(start, genAiResponseAttrs, genAiGeneralAttrs, genAiSignalLevel);
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
      abortSignal: ctx.request.signal,
      timeout: ctx.body.service_tier === "flex" ? cfg.timeouts.flex : cfg.timeouts.normal,
      experimental_include: {
        requestBody: false,
        responseBody: false,
      },
      ...textOptions,
    });
    logger.trace({ requestId: ctx.requestId, result }, "[chat] AI SDK result");
    addSpanEvent("hebo.ai-sdk.completed");
    recordTimeToFirstToken(performance.now() - start, genAiGeneralAttrs, genAiSignalLevel);

    // Transform result.
    ctx.result = toChatCompletions(result, ctx.resolvedModelId);
    logger.trace({ requestId: ctx.requestId, result: ctx.result }, "[chat] ChatCompletions");
    addSpanEvent("hebo.result.transformed");

    const genAiResponseAttrs = getChatResponseAttributes(ctx.result, genAiSignalLevel);
    setSpanAttributes(genAiResponseAttrs);
    recordTokenUsage(genAiResponseAttrs, genAiGeneralAttrs, genAiSignalLevel);

    if (hooks?.after) {
      ctx.result = (await hooks.after(ctx as AfterHookContext)) ?? ctx.result;
      addSpanEvent("hebo.hooks.after.completed");
    }

    recordTimePerOutputToken(start, genAiResponseAttrs, genAiGeneralAttrs, genAiSignalLevel);
    return ctx.result;
  };

  return { handler: winterCgHandler(handler, config) };
};
