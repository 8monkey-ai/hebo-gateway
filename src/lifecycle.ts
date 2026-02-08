import type { AfterHookContext, BeforeHookContext, GatewayConfig, GatewayContext } from "./types";

import { parseConfig } from "./config";
import { isLoggerDisabled, logger } from "./logger";
import { withAccessLog } from "./telemetry/access-log";
import { toOpenAIErrorResponse } from "./utils/errors";
import { maybeApplyRequestPatch, prepareRequestHeaders } from "./utils/request";
import { toResponse } from "./utils/response";

export const winterCgHandler = (
  run: (ctx: GatewayContext) => Promise<object | ReadableStream<Uint8Array>>,
  config: GatewayConfig,
) => {
  const parsedConfig = parseConfig(config);

  const core = async (ctx: GatewayContext): Promise<Response> => {
    try {
      const headers = prepareRequestHeaders(ctx.request);
      if (headers) ctx.request = new Request(ctx.request, { headers });

      const before = await parsedConfig.hooks?.before?.(ctx as BeforeHookContext);
      if (before) {
        if (before instanceof Response) return before;
        ctx.request = maybeApplyRequestPatch(ctx.request, before);
      }

      ctx.result = await run(ctx);

      const after = await parsedConfig.hooks?.after?.(ctx as AfterHookContext);
      const result = after ?? ctx.result;

      return result instanceof Response ? result : toResponse(result);
    } catch (error) {
      logger.error(error instanceof Error ? error : new Error(String(error)), {
        requestId: ctx.request.headers.get("x-request-id"),
      });
      return toOpenAIErrorResponse(error);
    }
  };

  const handler = isLoggerDisabled(parsedConfig.logger) ? core : withAccessLog(core);

  return (request: Request, state?: Record<string, unknown>) =>
    handler({
      request,
      state: state ?? {},
      providers: parsedConfig.providers,
      models: parsedConfig.models,
    });
};
