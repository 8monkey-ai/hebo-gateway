import type { AfterHookContext, BeforeHookContext, GatewayConfig, GatewayContext } from "./types";

import { parseConfig } from "./config";
import { createOpenAIErrorResponse } from "./utils/errors";
import { getRequestMeta, getResponseMeta, logger } from "./utils/logger";
import { maybeApplyRequestPatch } from "./utils/request";
import { toResponse, wrapStreamResponse } from "./utils/response";

export const withLifecycle = (
  run: (ctx: GatewayContext) => Promise<ReadableStream | object | string>,
  config: GatewayConfig,
) => {
  const parsedConfig = parseConfig(config);

  const handler = async (request: Request, state?: Record<string, unknown>): Promise<Response> => {
    const start = performance.now();

    const finalize = (response: Response, result?: string | ReadableStream, error?: unknown) => {
      const req = getRequestMeta(request);
      const durationMs = Math.round((performance.now() - start) * 100) / 100;

      const log = (streamBytes?: number, err: unknown = error) => {
        const res = getResponseMeta(response);
        res["durationMs"] = durationMs;
        res["streamBytes"] = streamBytes || 0;

        const msg = err != null ? "[gateway] request failed" : "[gateway] request completed";

        logger.info({ req, res }, msg);
      };

      if (!(result instanceof ReadableStream)) {
        log(typeof result === "string" ? result.length : undefined);
        return response;
      }

      return wrapStreamResponse(response, {
        onComplete: ({ streamBytes }) => log(streamBytes),
        // FUTURE log errors
        // onError: (err) => log(undefined, err),
      });
    };

    const context: GatewayContext = {
      request,
      state: state ?? {},
      providers: parsedConfig.providers,
      models: parsedConfig.models,
    };

    try {
      const before = await parsedConfig.hooks?.before?.(context as BeforeHookContext);
      if (before instanceof Response) return finalize(before);

      context.request = before ? maybeApplyRequestPatch(request, before) : request;

      const raw = await run(context);
      const result = raw instanceof ReadableStream ? raw : JSON.stringify(raw);
      context.response = toResponse(result);

      const after = await parsedConfig.hooks?.after?.(context as AfterHookContext);
      const response = after ?? context.response;

      return finalize(response, result);
    } catch (e) {
      return finalize(createOpenAIErrorResponse(e), undefined, e);
    }
  };

  return handler;
};
