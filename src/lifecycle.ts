import { parseConfig } from "./config.ts";
import { toAnthropicError, toAnthropicErrorResponse } from "./errors/anthropic.ts";
import { GatewayError } from "./errors/gateway.ts";
import { toOpenAIError, toOpenAIErrorResponse } from "./errors/openai.ts";
import { getErrorMeta } from "./errors/utils.ts";
import { logger } from "./logger/index.ts";
import { getBaggageAttributes } from "./telemetry/baggage.ts";
import { instrumentFetch } from "./telemetry/fetch.ts";
import { recordRequestDuration } from "./telemetry/gen-ai.ts";
import { getRequestAttributes, getResponseAttributes } from "./telemetry/http.ts";
import { observeV8jsMemoryMetrics } from "./telemetry/memory.ts";
import { addSpanEvent, setSpanEventsEnabled, setSpanTracer, startSpan } from "./telemetry/span.ts";
import type {
  GatewayConfig,
  GatewayConfigParsed,
  GatewayContext,
  OnErrorHookContext,
  OnRequestHookContext,
  OnResponseHookContext,
} from "./types.ts";
import { resolveOrCreateRequestId } from "./utils/request.ts";
import { prepareResponseInit, toResponse } from "./utils/response.ts";
import type { SseFrame } from "./utils/stream.ts";

export const winterCgHandler = (
  run: (
    ctx: GatewayContext,
    cfg: GatewayConfigParsed,
  ) => Promise<object | ReadableStream<SseFrame>>,
  config: GatewayConfig,
) => {
  const parsedConfig = parseConfig(config);

  if (parsedConfig.telemetry?.enabled) {
    setSpanTracer(parsedConfig.telemetry?.tracer);
    setSpanEventsEnabled(parsedConfig.telemetry?.signals?.hebo);
    instrumentFetch(parsedConfig.telemetry?.signals?.hebo);
    observeV8jsMemoryMetrics(parsedConfig.telemetry?.signals?.hebo);
  }

  return async (request: Request, state?: Record<string, unknown>): Promise<Response> => {
    const start = performance.now();
    const ctx: GatewayContext = {
      request,
      state: state ?? {},
      otel: {},
      providers: parsedConfig.providers,
      models: parsedConfig.models,
      requestId: resolveOrCreateRequestId(request),
    };

    const span = startSpan(ctx.request.url);
    span.setAttributes(getBaggageAttributes(ctx.request));
    if (!span.isExisting) {
      span.setAttributes(getRequestAttributes(ctx.request, parsedConfig.telemetry?.signals?.http));
      span.setAttributes({ "http.request.id": ctx.requestId });
    }

    const finalize = (status: number, reason?: unknown) => {
      if (ctx.operation) {
        span.updateName(`${ctx.operation}${ctx.modelId ? ` ${ctx.modelId}` : ""}`);
      }

      if (!span.isExisting) {
        // FUTURE add http.server.request.duration
        span.setAttributes(
          getResponseAttributes(ctx.response as Response, parsedConfig.telemetry?.signals?.http),
        );
      }

      let realStatus = status;
      if (ctx.request.signal.aborted) realStatus = 499;
      else if (status === 200 && ctx.response?.status) realStatus = ctx.response.status;

      if (realStatus !== 200) {
        const err: unknown = reason ?? ctx.request.signal.reason;
        logger[realStatus >= 500 ? "error" : "warn"]({
          requestId: ctx.requestId,
          err,
        });

        // On error we may not reach the handler's own ctx.otel flush, so flush here.
        span.setAttributes(ctx.otel);
        span.recordError(err, true);
      }
      span.setAttributes({ "http.response.status_code_effective": realStatus });

      if (
        ctx.operation === "chat" ||
        ctx.operation === "embeddings" ||
        ctx.operation === "messages" ||
        ctx.operation === "responses" ||
        ctx.operation === "transcriptions"
      ) {
        recordRequestDuration(
          performance.now() - start,
          realStatus,
          ctx,
          ctx.trace ?? parsedConfig.telemetry?.signals?.gen_ai,
        );
      }

      span.finish();
    };

    await span.runWithContext(async () => {
      try {
        if (parsedConfig.hooks?.onRequest) {
          const onRequest = await parsedConfig.hooks.onRequest(ctx as OnRequestHookContext);
          addSpanEvent("hebo.hooks.on_request.completed");

          if (onRequest instanceof Response) {
            ctx.response = onRequest;
          }
        }

        if (!ctx.response) {
          ctx.result = (await run(ctx, parsedConfig)) as typeof ctx.result;

          const toError = ctx.operation === "messages" ? toAnthropicError : toOpenAIError;
          ctx.response = toResponse(ctx.result!, prepareResponseInit(ctx.requestId, ctx.response), {
            onDone: finalize,
            toError: (error) => toError(error, ctx.requestId),
          });
        }

        if (parsedConfig.hooks?.onResponse) {
          const onResponse = await parsedConfig.hooks.onResponse(ctx as OnResponseHookContext);
          addSpanEvent("hebo.hooks.on_response.completed");
          if (onResponse) {
            ctx.response = onResponse;
          }
        }

        // FUTURE: this can leak if onResponse removed wrapper from response.body
        if (!(ctx.result instanceof ReadableStream)) {
          finalize((ctx.response as Response).status);
        }
      } catch (error) {
        if (parsedConfig.hooks?.onError) {
          try {
            ctx.error = error;
            const onError = await parsedConfig.hooks.onError(ctx as OnErrorHookContext);
            addSpanEvent("hebo.hooks.on_error.completed");
            if (onError) {
              ctx.response = onError;
            }
          } catch {
            logger.debug("[lifecycle] onError hook threw");
          }
        }
        const errorPayload = ctx.request.signal.aborted
          ? new GatewayError(error ?? ctx.request.signal.reason, 499)
          : error;
        if (!(ctx.response instanceof Response)) {
          const toErrorResponse =
            ctx.operation === "messages" ? toAnthropicErrorResponse : toOpenAIErrorResponse;
          ctx.response = toErrorResponse(
            errorPayload,
            prepareResponseInit(ctx.requestId, getErrorMeta(errorPayload)),
          );
        }
        finalize((ctx.response as Response).status, error);
      }
    });

    return (ctx.response as Response) ?? new Response("Internal Server Error", { status: 500 });
  };
};
