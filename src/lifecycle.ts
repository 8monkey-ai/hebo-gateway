import type {
  GatewayConfig,
  GatewayContext,
  OnRequestHookContext,
  OnResponseHookContext,
} from "./types";

import { parseConfig } from "./config";
import { toOpenAIErrorResponse } from "./errors/openai";
import { logger } from "./logger";
import { withAccessSpan } from "./telemetry/access-log";
import { resolveRequestId } from "./utils/headers";
import { maybeApplyRequestPatch, prepareRequestHeaders } from "./utils/request";
import { prepareResponseInit, toResponse } from "./utils/response";

export const winterCgHandler = (
  run: (ctx: GatewayContext) => Promise<object | ReadableStream<object>>,
  config: GatewayConfig,
) => {
  const parsedConfig = parseConfig(config);

  const core = async (ctx: GatewayContext): Promise<void> => {
    try {
      const onRequest = await parsedConfig.hooks?.onRequest?.(ctx as OnRequestHookContext);
      if (onRequest) {
        if (onRequest instanceof Response) {
          ctx.response = onRequest;
          return;
        }
        ctx.request = maybeApplyRequestPatch(ctx.request, onRequest);
      }

      ctx.result = (await run(ctx)) as typeof ctx.result;
      ctx.response = toResponse(ctx.result!, prepareResponseInit(ctx.request));

      const onResponse = await parsedConfig.hooks?.onResponse?.(ctx as OnResponseHookContext);
      if (onResponse) ctx.response = onResponse;
    } catch (error) {
      logger.error({
        requestId: resolveRequestId(ctx.request),
        err: error instanceof Error ? error : new Error(String(error)),
      });
      ctx.response = toOpenAIErrorResponse(error, prepareResponseInit(ctx.request));
    }
  };

  const handler = parsedConfig.telemetry?.enabled
    ? withAccessSpan(core, parsedConfig.telemetry?.tracer)
    : core;

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
