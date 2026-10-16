import * as z from "zod/mini";

import { GatewayError } from "../../errors/gateway";
import { winterCgHandler } from "../../lifecycle";
import { logger } from "../../logger";
import { forwardTranscriptionParams } from "../../middleware/common";
import { resolveProvider } from "../../providers/registry";
import { getGenAiGeneralAttributes, recordTokenUsage } from "../../telemetry/gen-ai";
import { addSpanEvent, setSpanAttributes } from "../../telemetry/span";
import type {
  AfterHookContext,
  BeforeHookContext,
  Endpoint,
  GatewayConfig,
  GatewayConfigParsed,
  GatewayContext,
  ResolveModelHookContext,
  ResolveProviderHookContext,
} from "../../types";
import { prepareForwardHeaders } from "../../utils/request";
import {
  convertToTranscriptionCallOptions,
  parseTranscriptionsRequest,
  toTranscriptions,
} from "./converters";
import { getTranscriptionsRequestAttributes, getTranscriptionsResponseAttributes } from "./otel";
import { TranscriptionsBodySchema, type TranscriptionsBody } from "./schema";

// Trace logs show the audio size instead of raw bytes. Redaction is deferred to
// serialization (`toJSON`), so nothing is copied when trace logging is disabled.
const redacted = (serialize: () => unknown) => ({ toJSON: serialize });
const audioSize = (audio: Uint8Array) => `[${audio.byteLength} bytes]`;

export const audioTranscriptions = (config: GatewayConfig): Endpoint => {
  const hooks = config.hooks;

  const handler = async (ctx: GatewayContext, cfg: GatewayConfigParsed) => {
    ctx.operation = "transcriptions";
    setSpanAttributes({ "gen_ai.operation.name": "transcription" });
    addSpanEvent("hebo.handler.started");

    // Guard: enforce HTTP method early.
    if (!ctx.request || ctx.request.method !== "POST") {
      throw new GatewayError("Method Not Allowed", 405);
    }

    // Parse + validate input (multipart or JSON; body size limits apply to both).
    const raw = await parseTranscriptionsRequest(ctx.request, cfg.advanced.maxBodySize);
    addSpanEvent("hebo.request.deserialized");

    const parsed = TranscriptionsBodySchema.safeParse(raw);
    if (!parsed.success) {
      throw new GatewayError(z.prettifyError(parsed.error), 400, undefined, parsed.error);
    }
    const validated = parsed.data;
    ctx.body = validated;
    // Logged after validation, so `input_audio.data` is always decoded bytes.
    logger.trace(
      {
        requestId: ctx.requestId,
        result: redacted(() => ({
          ...validated,
          input_audio: {
            format: validated.input_audio.format,
            data: audioSize(validated.input_audio.data),
          },
        })),
      },
      "[transcriptions] TranscriptionsBody",
    );
    addSpanEvent("hebo.request.parsed");

    if (hooks?.before) {
      ctx.body = ((await hooks.before(ctx as BeforeHookContext)) as TranscriptionsBody) ?? ctx.body;
      addSpanEvent("hebo.hooks.before.completed");
    }

    // Resolve model + provider (hooks may override defaults).
    ctx.modelId = ctx.body.model;
    ctx.resolvedModelId =
      (await hooks?.resolveModelId?.(ctx as ResolveModelHookContext)) ?? ctx.modelId;
    logger.debug(`[transcriptions] resolved ${ctx.modelId} to ${ctx.resolvedModelId}`);
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

    // `transcriptionModel` is optional on `ProviderV4`: canonical providers always define it
    // (throwing `NoSuchModelError` for unknown IDs), but raw providers or providers returned
    // by a `resolveProvider` hook may not.
    if (!ctx.provider.transcriptionModel) {
      throw new GatewayError(
        `Provider for model '${ctx.resolvedModelId}' does not support transcription`,
        422,
        "MODEL_UNSUPPORTED_OPERATION",
      );
    }
    const transcriptionModel = ctx.provider.transcriptionModel(ctx.resolvedModelId);
    ctx.resolvedProviderId = transcriptionModel.provider;
    logger.debug(
      `[transcriptions] using ${transcriptionModel.provider} for ${ctx.resolvedModelId}`,
    );
    addSpanEvent("hebo.provider.resolved");

    ctx.trace ??= ctx.body.trace ?? cfg.telemetry?.signals?.gen_ai;
    const genAiGeneralAttrs = getGenAiGeneralAttributes(ctx, ctx.trace);
    setSpanAttributes(genAiGeneralAttrs);

    // Convert inputs to AI SDK call options.
    const body = ctx.body;
    const { model: _model, trace: _trace, ...inputs } = body;
    const forward = forwardTranscriptionParams(transcriptionModel.provider);
    const transcriptionOptions = forward.transformParams(
      convertToTranscriptionCallOptions(
        inputs,
        transcriptionModel.provider,
        transcriptionModel.modelId,
      ),
    );
    logger.trace(
      {
        requestId: ctx.requestId,
        options: redacted(() => ({
          ...transcriptionOptions,
          audio: audioSize(transcriptionOptions.audio),
        })),
      },
      "[transcriptions] AI SDK options",
    );
    addSpanEvent("hebo.options.prepared");
    setSpanAttributes(getTranscriptionsRequestAttributes(body, ctx.trace));

    // Execute request. Calls `doGenerate` directly: `transcribe()` drops provider usage.
    // This also means no AI SDK retries (other endpoints retry twice by default): failed
    // uploads are not re-sent, so clients own retries for large, slow audio requests.
    const timeout = cfg.advanced.timeouts.normal;
    addSpanEvent("hebo.ai-sdk.started");
    const result = forward.transformResult(
      await transcriptionModel.doGenerate({
        ...transcriptionOptions,
        headers: prepareForwardHeaders(ctx.request, cfg.advanced.forwardHeaders),
        abortSignal: timeout
          ? AbortSignal.any([ctx.request.signal, AbortSignal.timeout(timeout)])
          : ctx.request.signal,
      }),
    );
    logger.trace(
      { requestId: ctx.requestId, result: { ...result, response: undefined } },
      "[transcriptions] AI SDK result",
    );
    addSpanEvent("hebo.ai-sdk.completed");
    if (result.response?.headers) ctx.response = { headers: result.response.headers };

    // Transform result.
    ctx.result = toTranscriptions(result, body.response_format);
    logger.trace(
      { requestId: ctx.requestId, result: ctx.result },
      "[transcriptions] Transcriptions",
    );
    addSpanEvent("hebo.result.transformed");
    const genAiResponseAttrs = getTranscriptionsResponseAttributes(ctx.result, ctx.trace);
    recordTokenUsage(genAiResponseAttrs, genAiGeneralAttrs, ctx.trace);
    setSpanAttributes(genAiResponseAttrs);

    if (hooks?.after) {
      ctx.result = (await hooks.after(ctx as AfterHookContext)) ?? ctx.result;
      addSpanEvent("hebo.hooks.after.completed");
    }

    return ctx.result;
  };

  return { handler: winterCgHandler(handler, config) };
};
