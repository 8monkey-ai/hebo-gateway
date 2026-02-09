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
      ctx.request = new Request(ctx.request, { body, signal: ctx.request.signal });
    }

    const logAccess = (
      status: number,
      stats?: { bytes?: number; streamStart?: number; streamEnd?: number },
    ) => {
      const totalDuration = +((stats?.streamEnd ?? performance.now()) - start).toFixed(2);
      const responseTime = stats?.streamStart && +(stats.streamStart - start).toFixed(2);
      const requestMeta = getRequestMeta(ctx.request);
      const responseMeta = getResponseMeta(ctx.response);

      const meta: Record<string, unknown> = {
        requestId: ctx.request.headers.get("x-request-id"),
        ai: getAIMeta(ctx),
        request: requestMeta,
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

      const realStatus = status === 200 ? (ctx.response?.status ?? status) : status;

      const msg = `${ctx.request.method} ${requestMeta["path"]} ${realStatus}`;

      logger.info(meta, msg);
    };

    await run(ctx);

    if (ctx.response!.body instanceof ReadableStream) {
      const instrumented = instrumentStream(
        ctx.response!.body,
        {
          onComplete: (status, params) => logAccess(status, params),
        },
        ctx.request.signal,
      );

      ctx.response = new Response(instrumented, {
        status: ctx.response!.status,
        statusText: ctx.response!.statusText,
        headers: ctx.response!.headers,
      });

      return;
    }

    logAccess(ctx.response!.status);
  };
