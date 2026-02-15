import type {
  GatewayConfig,
  GatewayContext,
  OnRequestHookContext,
  OnResponseHookContext,
} from "./types";

import { parseConfig } from "./config";
import { toOpenAIErrorResponse } from "./errors/openai";
import { logger } from "./logger";
import { initFetch } from "./telemetry/fetch";
import { withOtel } from "./telemetry/otel";
import { addSpanEvent, recordSpanError, setSpanTracer } from "./telemetry/span";
import { resolveRequestId } from "./utils/headers";
import { maybeApplyRequestPatch, prepareRequestHeaders } from "./utils/request";
import { prepareResponseInit, toResponse } from "./utils/response";

export const winterCgHandler = (
  run: (ctx: GatewayContext) => Promise<object | ReadableStream<object>>,
  config: GatewayConfig,
) => {
  const parsedConfig = parseConfig(config);
  if (parsedConfig.telemetry?.enabled) {
    setSpanTracer(parsedConfig.telemetry?.tracer);
    initFetch();
  }

  const core = async (ctx: GatewayContext): Promise<void> => {
    try {
      if (parsedConfig.hooks?.onRequest) {
        const onRequest = await parsedConfig.hooks.onRequest(ctx as OnRequestHookContext);
        addSpanEvent("hebo.hooks.on_request.completed");

        if (onRequest) {
          if (onRequest instanceof Response) {
            ctx.response = onRequest;
            return;
          }
          ctx.request = maybeApplyRequestPatch(ctx.request, onRequest);
        }
      }

      ctx.result = (await run(ctx)) as typeof ctx.result;
      ctx.response = toResponse(ctx.result!, prepareResponseInit(ctx.request));

      if (parsedConfig.hooks?.onResponse) {
        const onResponse = await parsedConfig.hooks.onResponse(ctx as OnResponseHookContext);
        addSpanEvent("hebo.hooks.on_response.completed");
        if (onResponse) {
          ctx.response = onResponse;
        }
      }
    } catch (error) {
      ctx.response = toOpenAIErrorResponse(error, prepareResponseInit(ctx.request));

      // FUTURE: 400 only on debug / add body?
      logger.error({
        requestId: resolveRequestId(ctx.request),
        err: error instanceof Error ? error : new Error(String(error)),
      });

      if (ctx.response.status >= 500) recordSpanError(error);
    }
  };

  const handler = parsedConfig.telemetry?.enabled ? withOtel(core, parsedConfig) : core;

  return async (request: Request, state?: Record<string, unknown>): Promise<Response> => {
    const ctx: GatewayContext = {
      request,
      state: state ?? {},
      providers: parsedConfig.providers,
      models: parsedConfig.models,
    };

    const headers = prepareRequestHeaders(ctx.request);
    if (headers) ctx.request = new Request(ctx.request, { headers });

    await handler(ctx);

    return ctx.response ?? new Response("Internal Server Error", { status: 500 });
  };
};
