import type {
  AfterHookContext,
  BeforeHookContext,
  GatewayConfig,
  GatewayContext,
  GatewayHooks,
} from "./types";

import { parseConfig } from "./config";
import { withInstrumentation } from "./instrumentation";
import { isLoggerDisabled, logger } from "./logger";
import { toOpenAIErrorResponse } from "./utils/errors";
import { maybeApplyRequestPatch, prepareRequestHeaders } from "./utils/request";
import { toResponse } from "./utils/response";

export const withHooks = (
  run: (ctx: GatewayContext) => Promise<object | ReadableStream<Uint8Array>>,
  hooks?: GatewayHooks,
) => {
  return async (context: GatewayContext) => {
    const before = await hooks?.before?.(context as BeforeHookContext);
    if (before) {
      if (before instanceof Response) return before;
      context.request = maybeApplyRequestPatch(context.request, before);
    }

    context.result = await run(context);

    const after = await hooks?.after?.(context as AfterHookContext);
    return after ?? context.result;
  };
};

export const createHandler = (
  run: (ctx: GatewayContext) => Promise<object | ReadableStream<Uint8Array>>,
  config: GatewayConfig,
) => {
  const parsedConfig = parseConfig(config);

  const hookedRun = withHooks(run, parsedConfig.hooks);

  const core = async (ctx: GatewayContext): Promise<Response> => {
    try {
      const headers = prepareRequestHeaders(ctx.request);
      if (headers) ctx.request = new Request(ctx.request, { headers });

      const result = await hookedRun(ctx);

      return result instanceof Response ? result : toResponse(result);
    } catch (error) {
      logger.error(error instanceof Error ? error : new Error(String(error)), {
        requestId: ctx.request.headers.get("x-request-id"),
      });
      return toOpenAIErrorResponse(error);
    }
  };

  const handler = isLoggerDisabled(parsedConfig.logger) ? core : withInstrumentation(core);

  return (request: Request, state?: Record<string, unknown>) =>
    handler({
      request,
      state: state ?? {},
      providers: parsedConfig.providers,
      models: parsedConfig.models,
    });
};
