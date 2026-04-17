import { parseConfig } from "./config";
import { toAnthropicError, toAnthropicErrorResponse } from "./errors/anthropic";
import { GatewayError } from "./errors/gateway";
import { toOpenAIError, toOpenAIErrorResponse } from "./errors/openai";
import { logger } from "./logger";
import { getBaggageAttributes } from "./telemetry/baggage";
import { instrumentFetch } from "./telemetry/fetch";
import { recordRequestDuration } from "./telemetry/gen-ai";
import { getRequestAttributes, getResponseAttributes } from "./telemetry/http";
import { observeV8jsMemoryMetrics } from "./telemetry/memory";
import { addSpanEvent, setSpanEventsEnabled, setSpanTracer, startSpan } from "./telemetry/span";
import type {
  GatewayConfig,
  GatewayConfigParsed,
  GatewayContext,
  OnErrorHookContext,
  OnRequestHookContext,
  OnResponseHookContext,
} from "./types";
import { resolveOrCreateRequestId } from "./utils/request";
import { prepareResponseInit, toResponse } from "./utils/response";
import type { SseFrame } from "./utils/stream";

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
          getResponseAttributes(ctx.response!, parsedConfig.telemetry?.signals?.http),
        );
      }

      let realStatus = status;
      if (ctx.request.signal.aborted) realStatus = 499;
      else if (status === 200 && ctx.response?.status) realStatus = ctx.response.status;

      if (realStatus !== 200) {
        logger[realStatus >= 500 ? "error" : "warn"]({
          requestId: ctx.requestId,
          err: reason ?? ctx.request.signal.reason,
        });

        const isUpstreamError =
          reason instanceof GatewayError && reason.code.startsWith("UPSTREAM_");
        span.recordError(reason, realStatus >= 500 || isUpstreamError);
      }
      span.setAttributes({ "http.response.status_code_effective": realStatus });

      if (
        ctx.operation === "chat" ||
        ctx.operation === "embeddings" ||
        ctx.operation === "messages" ||
        ctx.operation === "responses"
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

          const formatError = ctx.operation === "messages" ? toAnthropicError : toOpenAIError;
          ctx.response = toResponse(ctx.result!, prepareResponseInit(ctx.requestId), {
            onDone: finalize,
            formatError,
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
          finalize(ctx.response.status);
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
        const errorResponseInit = prepareResponseInit(ctx.requestId);
        ctx.response ??=
          ctx.operation === "messages"
            ? toAnthropicErrorResponse(errorPayload, errorResponseInit)
            : toOpenAIErrorResponse(errorPayload, errorResponseInit);
        finalize(ctx.response.status, error);
      }
    });

    return ctx.response ?? new Response("Internal Server Error", { status: 500 });
  };
};
