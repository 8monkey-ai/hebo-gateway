import type { AfterHookContext, BeforeHookContext, GatewayConfig, GatewayContext } from "./types";

import { parseConfig } from "./config";
import { toOpenAIErrorResponse } from "./errors/openai";
import { isLoggerDisabled, logger } from "./logger";
import { withAccessLog } from "./telemetry/access-log";
import { maybeApplyRequestPatch, prepareRequestHeaders } from "./utils/request";
import { toResponse } from "./utils/response";

export const winterCgHandler = (
  run: (ctx: GatewayContext) => Promise<object | ReadableStream<Uint8Array>>,
  config: GatewayConfig,
) => {
  const parsedConfig = parseConfig(config);

  const core = async (ctx: GatewayContext): Promise<void> => {
    try {
      const headers = prepareRequestHeaders(ctx.request);
      if (headers) ctx.request = new Request(ctx.request, { headers });

      const before = await parsedConfig.hooks?.before?.(ctx as BeforeHookContext);
      if (before) {
        if (before instanceof Response) {
          ctx.response = before;
          return;
        }
        ctx.request = maybeApplyRequestPatch(ctx.request, before);
      }

      ctx.result = await run(ctx);

      const after = await parsedConfig.hooks?.after?.(ctx as AfterHookContext);
      if (after) ctx.result = after;

      ctx.response = ctx.result instanceof Response ? ctx.result : toResponse(ctx.result);
    } catch (error) {
      logger.error(error instanceof Error ? error : new Error(String(error)), {
        requestId: ctx.request.headers.get("x-request-id"),
      });
      ctx.response = toOpenAIErrorResponse(error);
    }
  };

  const handler = isLoggerDisabled(parsedConfig.logger) ? core : withAccessLog(core);

  return async (request: Request, state?: Record<string, unknown>): Promise<Response> => {
    const ctx: GatewayContext = {
      request,
      state: state ?? {},
      providers: parsedConfig.providers,
      models: parsedConfig.models,
    };

    await handler(ctx);

    return ctx.response!;
  };
};
