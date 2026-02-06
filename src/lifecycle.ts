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
    // Initialize some logging variables
    const start = performance.now();

    let requestBytes = 0;
    if (request.body) {
      const bodyBuffer = await request.arrayBuffer();
      requestBytes = bodyBuffer.byteLength;
      // eslint-disable-next-line unicorn/no-invalid-fetch-options
      request = new Request(request, { body: bodyBuffer });
    }

    const finalize = (response: Response, error?: unknown) => {
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
        res["bytesIn"] = requestBytes;
        res["bytesOut"] = stats?.bytes ?? Number(response.headers.get("content-length"));

        const msg = err ? "[gateway] request failed" : "[gateway] request completed";

        logger.info({ req, res }, msg);
      };

      if (!(response.body instanceof ReadableStream)) {
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

      // eslint-disable-next-line no-unused-expressions
      before && (context.request = maybeApplyRequestPatch(context.request, before));

      context.response = toResponse(await run(context));

      const after = await parsedConfig.hooks?.after?.(context as AfterHookContext);
      const response = after ?? context.response;

      return finalize(response);
    } catch (e) {
      return finalize(createOpenAIErrorResponse(e), e);
    }
  };

  return handler;
};
