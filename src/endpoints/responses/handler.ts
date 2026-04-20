import {
  generateText,
  Output,
  streamText,
  wrapLanguageModel,
  type GenerateTextResult,
  type ToolSet,
} from "ai";
import * as z from "zod";

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
import { convertToTextCallOptions, toResponses, toResponsesStream } from "./converters";
import { getResponsesRequestAttributes, getResponsesResponseAttributes } from "./otel";
import { ResponsesBodySchema, type ResponsesBody, type ResponsesInputs } from "./schema";

export const responses = (config: GatewayConfig): Endpoint => {
  const hooks = config.hooks;

  const handler = async (ctx: GatewayContext, cfg: GatewayConfigParsed) => {
    const start = performance.now();
    ctx.operation = "responses";
    setSpanAttributes({ "gen_ai.operation.name": ctx.operation });
    addSpanEvent("hebo.handler.started");

    if (!ctx.request || ctx.request.method !== "POST") {
      throw new GatewayError("Method Not Allowed", 405);
    }

    // Parse + validate input (handles Content-Encoding decompression + body size limits).
    ctx.body = (await parseRequestBody(ctx.request, cfg.advanced.maxBodySize)) as typeof ctx.body;
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

    ctx.modelId = ctx.body.model;
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

    ctx.trace ??= ctx.body.trace ?? cfg.telemetry?.signals?.gen_ai;
    const genAiGeneralAttrs = getGenAiGeneralAttributes(ctx, ctx.trace);
    setSpanAttributes(genAiGeneralAttrs);

    const { model: _model, stream, trace: _trace, ...inputs } = ctx.body;
    const textOptions = convertToTextCallOptions(inputs as ResponsesInputs);
    logger.trace({ requestId: ctx.requestId, options: textOptions }, "[responses] AI SDK options");
    addSpanEvent("hebo.options.prepared");
    setSpanAttributes(getResponsesRequestAttributes(ctx.body, ctx.trace));

    const languageModelWithMiddleware = wrapLanguageModel({
      model: languageModel,
      middleware: modelMiddlewareMatcher.for(ctx.resolvedModelId, languageModel.provider),
    });

    if (stream) {
      addSpanEvent("hebo.ai-sdk.started");
      let ttft = 0;
      const result = streamText({
        model: languageModelWithMiddleware,
        headers: prepareForwardHeaders(ctx.request, cfg.advanced.forwardHeaders),
        abortSignal: ctx.request.signal,
        timeout: {
          totalMs:
            ctx.body.service_tier === "flex"
              ? cfg.advanced.timeouts.flex
              : cfg.advanced.timeouts.normal,
        },
        onAbort: () => {
          throw new DOMException("The operation was aborted.", "AbortError");
        },
        onError: () => {},
        onChunk: () => {
          if (!ttft) {
            ttft = performance.now() - start;
            recordTimeToFirstToken(ttft, genAiGeneralAttrs, ctx.trace);
          }
        },
        onFinish: (res) => {
          addSpanEvent("hebo.ai-sdk.completed");
          const streamResult = toResponses(
            res as unknown as GenerateTextResult<ToolSet, Output.Output>,
            ctx.resolvedModelId!,
            (ctx.body as ResponsesBody).metadata,
          );
          logger.trace({ requestId: ctx.requestId, result: streamResult }, "[responses] Responses");
          addSpanEvent("hebo.result.transformed");

          const genAiResponseAttrs = getResponsesResponseAttributes(
            streamResult,
            ctx.trace,
            res.finishReason,
          );
          setSpanAttributes(genAiResponseAttrs);
          recordTokenUsage(genAiResponseAttrs, genAiGeneralAttrs, ctx.trace);
          recordTimePerOutputToken(start, ttft, genAiResponseAttrs, genAiGeneralAttrs, ctx.trace);
        },
        experimental_include: {
          requestBody: false,
        },
        includeRawChunks: false,
        ...textOptions,
      });

      ctx.result = toResponsesStream(result, ctx.resolvedModelId, ctx.body.metadata);

      if (hooks?.after) {
        ctx.result = (await hooks.after(ctx as AfterHookContext)) ?? ctx.result;
        addSpanEvent("hebo.hooks.after.completed");
      }

      return ctx.result;
    }

    addSpanEvent("hebo.ai-sdk.started");
    const result = await generateText({
      model: languageModelWithMiddleware,
      headers: prepareForwardHeaders(ctx.request, cfg.advanced.forwardHeaders),
      abortSignal: ctx.request.signal,
      timeout:
        ctx.body.service_tier === "flex"
          ? cfg.advanced.timeouts.flex
          : cfg.advanced.timeouts.normal,
      experimental_include: {
        requestBody: false,
        responseBody: false,
      },
      ...textOptions,
    });
    logger.trace({ requestId: ctx.requestId, result }, "[responses] AI SDK result");
    addSpanEvent("hebo.ai-sdk.completed");
    if (result.response.headers) ctx.response = { headers: result.response.headers };
    recordTimeToFirstToken(performance.now() - start, genAiGeneralAttrs, ctx.trace);

    ctx.result = toResponses(result, ctx.resolvedModelId, ctx.body.metadata);
    logger.trace({ requestId: ctx.requestId, result: ctx.result }, "[responses] Responses");
    addSpanEvent("hebo.result.transformed");

    const genAiResponseAttrs = getResponsesResponseAttributes(
      ctx.result,
      ctx.trace,
      result.finishReason,
    );
    setSpanAttributes(genAiResponseAttrs);
    recordTokenUsage(genAiResponseAttrs, genAiGeneralAttrs, ctx.trace);

    if (hooks?.after) {
      ctx.result = (await hooks.after(ctx as AfterHookContext)) ?? ctx.result;
      addSpanEvent("hebo.hooks.after.completed");
    }

    recordTimePerOutputToken(start, 0, genAiResponseAttrs, genAiGeneralAttrs, ctx.trace);
    return ctx.result;
  };

  return { handler: winterCgHandler(handler, config) };
};
