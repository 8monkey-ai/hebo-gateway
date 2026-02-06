import type { AfterHookContext, BeforeHookContext, GatewayConfig, GatewayContext } from "./types";

import { parseConfig } from "./config";
import { toOpenAIErrorResponse } from "./utils/errors";
import { getRequestMeta, getResponseMeta, logger } from "./utils/logger";
import { maybeApplyRequestPatch, prepareRequestHeaders } from "./utils/request";
import { toResponse, instrumentStreamResponse } from "./utils/response";

const withLogger = async (context: GatewayContext) => {
  const start = performance.now();

  let body: ArrayBuffer | undefined;
  let requestBytes = 0;
  if (context.request.body && context.request.method !== "GET") {
    body = await context.request.arrayBuffer();
    requestBytes = body.byteLength;
    // eslint-disable-next-line no-invalid-fetch-options
    context.request = new Request(context.request, { body });
  }

  const logAccess = (
    response: Response,
    kind: string,
    stats?: { bytes?: number; firstByteAt?: number; lastByteAt?: number },
  ) => {
    const totalDuration = +((stats?.lastByteAt ?? performance.now()) - start).toFixed(2);
    const responseTime = stats?.firstByteAt && +(stats.firstByteAt - start).toFixed(2);

    const meta: Record<string, unknown> = {
      req: getRequestMeta(context.request),
      res: getResponseMeta(response),
      requestId: context.request.headers.get("x-request-id"),
      totalDuration,
      responseTime: responseTime ?? totalDuration,
      bytesIn: requestBytes,
      bytesOut: stats?.bytes ?? Number(response.headers.get("content-length")),
    };

    const msg = `[gateway] request ${kind}`;

    if (kind === "errored") {
      logger.error(meta, msg);
    } else if (kind === "cancelled") {
      logger.warn(meta, msg);
    } else {
      logger.info(meta, msg);
    }
  };

  const logError = (error: unknown) => {
    logger.error({
      requestId: context.request.headers.get("x-request-id"),
      err: error instanceof Error ? error : new Error(String(error)),
    });
  };

  const withLog = (response: Response, error?: unknown) => {
    if (error) logError(error);

    if (!(response.body instanceof ReadableStream)) {
      logAccess(response, error ? "failed" : "completed");
      return response;
    }

    return instrumentStreamResponse(
      response,
      {
        onComplete: (kind, params) => logAccess(response, kind, params),
        onError: (err) => logError(err),
      },
      context.request.signal,
    );
  };

  return withLog;
};

export const withLifecycle = (
  run: (ctx: GatewayContext) => Promise<ReadableStream<Uint8Array> | object | string>,
  config: GatewayConfig,
) => {
  const parsedConfig = parseConfig(config);

  const handler = async (request: Request, state?: Record<string, unknown>): Promise<Response> => {
    // Context that's passed around each handler & hook
    const context: GatewayContext = {
      request,
      state: state ?? {},
      providers: parsedConfig.providers,
      models: parsedConfig.models,
    };

    // Set x-request-id if not part of request
    const headers = prepareRequestHeaders(context.request);
    if (headers) {
      context.request = new Request(context.request, { headers });
    }

    // Log when finalizing the request (stream-compatible)
    const withLog = await withLogger(context);

    // The actual lifecycle logic
    try {
      const before = await parsedConfig.hooks?.before?.(context as BeforeHookContext);
      if (before instanceof Response) return withLog(before);

      // eslint-disable-next-line no-unused-expressions
      before && (context.request = maybeApplyRequestPatch(context.request, before));

      context.response = toResponse(await run(context));

      const after = await parsedConfig.hooks?.after?.(context as AfterHookContext);
      const response = after ?? context.response;

      return withLog(response);
    } catch (e) {
      return withLog(toOpenAIErrorResponse(e), e);
    }
  };

  return handler;
};
