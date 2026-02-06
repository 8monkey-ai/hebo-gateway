import type { AfterHookContext, BeforeHookContext, GatewayConfig, GatewayContext } from "./types";

import { parseConfig } from "./config";
import { toOpenAIErrorResponse } from "./utils/errors";
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

    let body: ArrayBuffer | undefined;
    if (request.body) {
      body = await request.arrayBuffer();
      requestBytes = body.byteLength;
    }

    const existingRequestId = request.headers.get("x-request-id");
    const requestId =
      existingRequestId ??
      request.headers.get("x-correlation-id") ??
      request.headers.get("x-trace-id") ??
      crypto.randomUUID();

    let headers: Headers | undefined;
    if (!existingRequestId) {
      headers = new Headers(request.headers);
      headers.set("x-request-id", requestId);
    }

    request = new Request(request, {
      ...(headers ? { headers } : {}),
      ...(body ? { body } : {}),
    });

    // Log when finalizing the request (stream-compatible)
    const finalize = (response: Response, error?: unknown) => {
      const logAccess = (
        kind: string,
        stats?: { bytes?: number; firstByteAt?: number; lastByteAt?: number },
      ) => {
        const meta: Record<string, unknown> = {
          req: getRequestMeta(request),
          res: getResponseMeta(response),
          requestId: request.headers.get("x-request-id"),
        };

        meta["totalDuration"] = +((stats?.lastByteAt ?? performance.now()) - start).toFixed(2);
        meta["responseTime"] = stats?.firstByteAt
          ? +(stats.firstByteAt - start).toFixed(2)
          : meta["totalDuration"];
        meta["bytesIn"] = requestBytes;
        meta["bytesOut"] = stats?.bytes ?? Number(response.headers.get("content-length"));

        const msg = `[gateway] request ${kind}`;

        logger.info(meta, msg);
      };

      const logError = (error: unknown) => {
        logger.error({
          requestId: request.headers.get("x-request-id"),
          err: error instanceof Error ? error : new Error(String(error)),
        });
      };

      if (error) logError(error);

      if (!(response.body instanceof ReadableStream)) {
        logAccess(error ? "failed" : "completed");
        return response;
      }

      return wrapStreamResponse(
        response,
        {
          onComplete: (kind, params) => logAccess(kind, params),
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
      return finalize(toOpenAIErrorResponse(e), e);
    }
  };

  return handler;
};
