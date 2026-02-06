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
    // Initialize some variables needed for logging later
    const start = performance.now();

    let requestBytes = 0;
    if (request.body) {
      const bodyBuffer = await request.arrayBuffer();
      requestBytes = bodyBuffer.byteLength;
      // eslint-disable-next-line unicorn/no-invalid-fetch-options
      request = new Request(request, { body: bodyBuffer });
    }

    // Log when finalizing the request (stream-compatible)
    const finalize = (response: Response, error?: unknown) => {
      const logAccess = (
        stats?: { bytes?: number; firstByteAt?: number; lastByteAt?: number },
        aborted = false,
      ) => {
        const req = getRequestMeta(request);
        const res = getResponseMeta(response);
        res["durationMs"] = +((stats?.lastByteAt ?? performance.now()) - start).toFixed(2);
        res["ttfbMs"] = stats?.firstByteAt
          ? +(stats.firstByteAt - start).toFixed(2)
          : res["durationMs"];
        res["bytesIn"] = requestBytes;
        res["bytesOut"] = stats?.bytes ?? Number(response.headers.get("content-length"));

        const msg = aborted
          ? "[gateway] request aborted"
          : response.status >= 400
            ? "[gateway] request failed"
            : "[gateway] request completed";

        logger.info({ req, res }, msg);
      };

      const logError = (err: unknown) => {
        logger.error(err instanceof Error ? err : new Error(String(err)));
      };

      if (error) logError(error);

      if (!(response.body instanceof ReadableStream)) {
        logAccess();
        return response;
      }

      return wrapStreamResponse(
        response,
        {
          onComplete: (params, aborted) => logAccess(params, aborted),
          onError: (err) => logError(err),
        },
        request.signal,
      );
    };

    // The actual lifecycle logic
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
