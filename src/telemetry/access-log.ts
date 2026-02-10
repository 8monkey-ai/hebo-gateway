import type { GatewayContext } from "../types";

import { logger } from "../logger";
import { clearPerf, getPerfMeta, initPerf, markPerf } from "./perf";
import { instrumentStream } from "./stream";
import { getAIMeta, getRequestMeta, getResponseMeta } from "./utils";

export const withAccessLog =
  (run: (ctx: GatewayContext) => Promise<void>) => async (ctx: GatewayContext) => {
    initPerf(ctx.request);

    const requestBytes = (() => {
      const n = Number(ctx.request.headers.get("content-length"));
      return Number.isFinite(n) ? n : undefined;
    })();

    const logAccess = (status: number, stats?: { bytes?: number }) => {
      if (!stats) markPerf(ctx.request, "responseTime");
      markPerf(ctx.request, "totalDuration");

      const requestMeta = getRequestMeta(ctx.request);
      const responseMeta = getResponseMeta(ctx.response);

      const meta: Record<string, unknown> = {
        requestId: ctx.request.headers.get("x-request-id"),
        ai: getAIMeta(ctx),
        request: requestMeta,
        response: responseMeta,
        timings: getPerfMeta(ctx.request),
        bytes: {
          in: requestBytes,
          out: stats?.bytes ?? responseMeta["contentLength"],
        },
      };

      const realStatus = status === 200 ? (ctx.response?.status ?? status) : status;

      const msg = `${ctx.request.method} ${requestMeta["path"]} ${realStatus}`;

      logger.info(meta, msg);

      clearPerf(ctx.request);
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

      markPerf(ctx.request, "responseTime");

      return;
    }

    logAccess(ctx.response!.status);
  };
