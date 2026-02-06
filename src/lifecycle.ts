import type { AfterHookContext, BeforeHookContext, GatewayConfig, GatewayContext } from "./types";

import { parseConfig } from "./config";
import { createOpenAIErrorResponse } from "./utils/errors";
import { getRequestMeta, getResponseMeta, logger } from "./utils/logger";
import { maybeApplyRequestPatch } from "./utils/request";
import { toResponse, wrapStreamResponse } from "./utils/response";

export const withLifecycle = (
  run: (ctx: GatewayContext) => Promise<ReadableStream<Uint8Array> | object | string>,
  config: GatewayConfig,
) => {
  const parsedConfig = parseConfig(config);

  const handler = async (request: Request, state?: Record<string, unknown>): Promise<Response> => {
    const start = performance.now();

    const finalize = (
      response: Response,
      result?: ReadableStream<Uint8Array> | Uint8Array<ArrayBuffer> | object | string,
      error?: unknown,
    ) => {
      const req = getRequestMeta(request);

      const log = (
        stats?: { bytes?: number; firstByteAt?: number; lastByteAt?: number },
        err: unknown = error,
      ) => {
        const res = getResponseMeta(response);
        res["durationMs"] = +((stats?.lastByteAt ?? performance.now()) - start).toFixed(2);
        res["ttfbMs"] = stats?.firstByteAt
          ? +(stats.firstByteAt - start).toFixed(2)
          : res["durationMs"];
        res["bytes"] = stats?.bytes ?? Number(response.headers.get("content-length"));

        const msg = err ? "[gateway] request failed" : "[gateway] request completed";

        logger.info({ req, res }, msg);
      };

      if (!(result instanceof ReadableStream)) {
        log();
        return response;
      }

      return wrapStreamResponse(response, {
        onComplete: (params) => log(params),
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

      const result = await run(context);
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
