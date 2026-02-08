import type { GatewayContext } from "../types";

import { logger } from "../logger";
import { instrumentStream } from "./stream";
import { getAIMeta, getRequestMeta, getResponseMeta } from "./utils";

export const withAccessLog =
  (run: (context: GatewayContext) => Promise<Response>) =>
  async (context: GatewayContext): Promise<Response> => {
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
      kind: string,
      stats?: { bytes?: number; firstByteAt?: number; lastByteAt?: number },
      response?: Response,
    ) => {
      const totalDuration = +((stats?.lastByteAt ?? performance.now()) - start).toFixed(2);
      const responseTime = stats?.firstByteAt && +(stats.firstByteAt - start).toFixed(2);
      const responseMeta = getResponseMeta(response);

      const meta: Record<string, unknown> = {
        requestId: context.request.headers.get("x-request-id"),
        ai: getAIMeta(context),
        request: getRequestMeta(context.request),
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
        requestId: context.request.headers.get("x-request-id"),
      });
    };

    try {
      const response = await run(context);
      if (response.body) {
        const instrumented = instrumentStream(
          response.body,
          {
            onComplete: (kind, params) => logAccess(kind, params, response),
            onError: (err) => logError(err),
          },
          context.request.signal,
        );
        return new Response(instrumented, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      }

      logAccess(response.status >= 400 ? "errored" : "completed", undefined, response);
      return response;
    } catch (error) {
      logError(error);
      throw error;
    }
  };
