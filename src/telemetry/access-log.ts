import type { GatewayContext } from "../types";

import { logger } from "../logger";
import { instrumentStream } from "./stream";
import { getAIMeta, getRequestMeta, getResponseMeta } from "./utils";

export const withAccessLog =
  (run: (ctx: GatewayContext) => Promise<void>) => async (ctx: GatewayContext) => {
    const start = performance.now();

    let body: ArrayBuffer | undefined;
    let requestBytes = 0;
    if (ctx.request.body && ctx.request.method !== "GET") {
      body = await ctx.request.arrayBuffer();
      requestBytes = body.byteLength;
      // eslint-disable-next-line no-invalid-fetch-options
      ctx.request = new Request(ctx.request, { body });
    }

    const logAccess = (
      kind: string,
      stats?: { bytes?: number; firstByteAt?: number; lastByteAt?: number },
    ) => {
      const totalDuration = +((stats?.lastByteAt ?? performance.now()) - start).toFixed(2);
      const responseTime = stats?.firstByteAt && +(stats.firstByteAt - start).toFixed(2);
      const responseMeta = getResponseMeta(ctx.response);

      const meta: Record<string, unknown> = {
        requestId: ctx.request.headers.get("x-request-id"),
        ai: getAIMeta(ctx),
        request: getRequestMeta(ctx.request),
        response: responseMeta,
        timings: {
          totalDuration,
          responseTime: responseTime ?? totalDuration,
        },
        bytes: {
          in: requestBytes,
          out: stats?.bytes ?? responseMeta["contentLength"],
        },
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
      logger.error(error instanceof Error ? error : new Error(String(error)), {
        requestId: ctx.request.headers.get("x-request-id"),
      });
    };

    await run(ctx);

    if (ctx.response!.body) {
      const instrumented = instrumentStream(
        ctx.response!.body,
        {
          onComplete: (kind, params) => logAccess(kind, params),
          onError: (err) => logError(err),
        },
        ctx.request.signal,
      );
      ctx.response = new Response(instrumented, {
        status: ctx.response!.status,
        statusText: ctx.response!.statusText,
        headers: ctx.response!.headers,
      });
    }

    logAccess(ctx.response!.status >= 400 ? "errored" : "completed");
  };
