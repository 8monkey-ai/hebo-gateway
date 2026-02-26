import type {
  GatewayConfig,
  GatewayContext,
  OnRequestHookContext,
  OnResponseHookContext,
} from "./types";

import { parseConfig } from "./config";
import { GatewayError } from "./errors/gateway";
import { toOpenAIErrorResponse } from "./errors/openai";
import { logger } from "./logger";
import { getBaggageAttributes } from "./telemetry/baggage";
import { instrumentFetch } from "./telemetry/fetch";
import { getRequestAttributes, getResponseAttributes } from "./telemetry/http";
import { recordV8jsMemory } from "./telemetry/memory";
import { addSpanEvent, setSpanEventsEnabled, setSpanTracer, startSpan } from "./telemetry/span";
import { wrapStream } from "./telemetry/stream";
import { resolveOrCreateRequestId } from "./utils/request";
import { prepareResponseInit, toResponse } from "./utils/response";

export const winterCgHandler = (
  run: (ctx: GatewayContext) => Promise<object | ReadableStream<object>>,
  config: GatewayConfig,
) => {
  const parsedConfig = parseConfig(config);

  if (parsedConfig.telemetry?.enabled) {
    setSpanTracer(parsedConfig.telemetry?.tracer);
    setSpanEventsEnabled(parsedConfig.telemetry?.signals?.hebo);
    instrumentFetch(parsedConfig.telemetry?.signals?.hebo);
  }

  return async (request: Request, state?: Record<string, unknown>): Promise<Response> => {
    const ctx: GatewayContext = {
      request,
      state: state ?? {},
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

        if (realStatus >= 500) span.recordError(reason);
      }
      span.setAttributes({ "http.response.status_code_effective": realStatus });

      recordV8jsMemory(parsedConfig.telemetry?.signals?.hebo);

      span.finish();
    };

    try {
      if (parsedConfig.hooks?.onRequest) {
        const onRequest = await parsedConfig.hooks.onRequest(ctx as OnRequestHookContext);
        addSpanEvent("hebo.hooks.on_request.completed");

        if (onRequest instanceof Response) {
          ctx.response = onRequest;
        }
      }

      if (!ctx.response) {
        ctx.result = (await span.runWithContext(() => run(ctx))) as typeof ctx.result;

        if (ctx.result instanceof ReadableStream) {
          ctx.result = wrapStream(ctx.result, { onDone: finalize });
        }

        ctx.response = toResponse(ctx.result!, prepareResponseInit(ctx.requestId));
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
      ctx.response = toOpenAIErrorResponse(
        ctx.request.signal.aborted
          ? new GatewayError(error ?? ctx.request.signal.reason, 499)
          : error,
        prepareResponseInit(ctx.requestId),
      );
      finalize(ctx.response.status, error);
    }

    return ctx.response ?? new Response("Internal Server Error", { status: 500 });
  };
};
