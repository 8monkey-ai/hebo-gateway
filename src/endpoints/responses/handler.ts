import {
  generateText,
  streamText,
  wrapLanguageModel,
  type GenerateTextResult,
  type ToolSet,
} from "ai";
import * as z from "zod/mini";

import type {
  AfterHookContext,
  BeforeHookContext,
  Endpoint,
  GatewayConfig,
  GatewayContext,
  ResolveModelHookContext,
  ResolveProviderHookContext,
} from "../../types";

import { GatewayError } from "../../errors/gateway";
import { winterCgHandler } from "../../lifecycle";
import { logger } from "../../logger";
import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { resolveProvider } from "../../providers/registry";
import {
  recordRequestDuration,
  recordTimePerOutputToken,
  recordTokenUsage,
} from "../../telemetry/gen-ai";
import { addSpanEvent, setSpanAttributes } from "../../telemetry/span";
import { prepareForwardHeaders } from "../../utils/request";
import { convertToTextCallOptions, toResponses, toResponsesStream } from "./converters";
import {
  getResponsesGeneralAttributes,
  getResponsesRequestAttributes,
  getResponsesResponseAttributes,
} from "./otel";
import { ResponsesBodySchema, type ResponsesBody } from "./schema";

export const responses = (config: GatewayConfig): Endpoint => {
  const hooks = config.hooks;

  const handler = async (ctx: GatewayContext) => {
    const start = performance.now();
    ctx.operation = "responses";
    addSpanEvent("hebo.handler.started");

    if (!ctx.request || ctx.request.method !== "POST") {
      throw new GatewayError("Method Not Allowed", 405);
    }

    try {
      ctx.body = await ctx.request.json();
    } catch {
      throw new GatewayError("Invalid JSON", 400);
    }
    logger.trace({ requestId: ctx.requestId, body: ctx.body }, "[responses] ResponsesBody");
    addSpanEvent("hebo.request.deserialized");

    const parsed = ResponsesBodySchema.safeParse(ctx.body);
    if (!parsed.success) {
      throw new GatewayError(z.prettifyError(parsed.error), 400, undefined, parsed.error);
    }
    ctx.body = parsed.data;
    addSpanEvent("hebo.request.parsed");

    if (hooks?.before) {
      ctx.body = ((await hooks.before(ctx as BeforeHookContext)) as ResponsesBody) ?? ctx.body;
      addSpanEvent("hebo.hooks.before.completed");
    }

    let inputs, stream;
    ({ model: ctx.modelId, stream, ...inputs } = ctx.body);

    ctx.resolvedModelId =
      (await hooks?.resolveModelId?.(ctx as ResolveModelHookContext)) ?? ctx.modelId;
    logger.debug(`[responses] resolved ${ctx.modelId} to ${ctx.resolvedModelId}`);
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
    logger.debug(`[responses] using ${languageModel.provider} for ${ctx.resolvedModelId}`);
    addSpanEvent("hebo.provider.resolved");

    const genAiSignalLevel = config.telemetry?.signals?.gen_ai;
    const genAiGeneralAttrs = getResponsesGeneralAttributes(ctx, genAiSignalLevel);
    setSpanAttributes(genAiGeneralAttrs);

    const textOptions = convertToTextCallOptions(inputs);
    logger.trace({ requestId: ctx.requestId, options: textOptions }, "[responses] AI SDK options");
    addSpanEvent("hebo.options.prepared");
    setSpanAttributes(getResponsesRequestAttributes(ctx.body, genAiSignalLevel));

    const languageModelWithMiddleware = wrapLanguageModel({
      model: languageModel,
      middleware: modelMiddlewareMatcher.for(ctx.resolvedModelId, languageModel.provider),
    });

    if (stream) {
      addSpanEvent("hebo.ai-sdk.started");
      const result = streamText({
        model: languageModelWithMiddleware,
        headers: prepareForwardHeaders(ctx.request),
        abortSignal: ctx.request.signal,
        timeout: {
          totalMs: 5 * 60 * 1000,
        },
        onAbort: () => {
          throw new DOMException("The operation was aborted.", "AbortError");
        },
        onError: () => {},
        onFinish: (res) => {
          addSpanEvent("hebo.ai-sdk.completed");
          const responseResult = toResponses(
            res as unknown as GenerateTextResult<ToolSet, import("ai").Output.Output>,
            ctx.resolvedModelId!,
            ctx.body as ResponsesBody,
          );
          logger.trace(
            { requestId: ctx.requestId, result: responseResult },
            "[responses] responseResult",
          );
          addSpanEvent("hebo.result.transformed");

          const genAiResponseAttrs = getResponsesResponseAttributes(
            responseResult,
            genAiSignalLevel,
          );
          setSpanAttributes(genAiResponseAttrs);
          recordTokenUsage(genAiResponseAttrs, genAiGeneralAttrs, genAiSignalLevel);
          recordTimePerOutputToken(start, genAiResponseAttrs, genAiGeneralAttrs, genAiSignalLevel);
          recordRequestDuration(start, genAiGeneralAttrs, genAiSignalLevel);
        },
        experimental_include: {
          requestBody: false,
        },
        includeRawChunks: false,
        ...textOptions,
      });

      ctx.result = toResponsesStream(result, ctx.resolvedModelId, ctx.body as ResponsesBody);

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
      timeout: 5 * 60 * 1000,
      experimental_include: {
        requestBody: false,
        responseBody: false,
      },
      ...textOptions,
    });
    logger.trace({ requestId: ctx.requestId, result }, "[responses] AI SDK result");
    addSpanEvent("hebo.ai-sdk.completed");

    ctx.result = toResponses(result, ctx.resolvedModelId, ctx.body as ResponsesBody);
    logger.trace({ requestId: ctx.requestId, result: ctx.result }, "[responses] Responses");
    addSpanEvent("hebo.result.transformed");

    const genAiResponseAttrs = getResponsesResponseAttributes(ctx.result, genAiSignalLevel);
    setSpanAttributes(genAiResponseAttrs);
    recordTokenUsage(genAiResponseAttrs, genAiGeneralAttrs, genAiSignalLevel);

    if (hooks?.after) {
      ctx.result = (await hooks.after(ctx as AfterHookContext)) ?? ctx.result;
      addSpanEvent("hebo.hooks.after.completed");
    }

    recordTimePerOutputToken(start, genAiResponseAttrs, genAiGeneralAttrs, genAiSignalLevel);
    recordRequestDuration(start, genAiGeneralAttrs, genAiSignalLevel);
    return ctx.result;
  };

  return { handler: winterCgHandler(handler, config) };
};
