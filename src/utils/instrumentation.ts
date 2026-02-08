import type { GatewayContext } from "../types";

import { logger } from "./logger";

type InstrumentStreamEndKind = "completed" | "cancelled" | "errored";

export type InstrumentStreamHooks = {
  onComplete?: (
    kind: InstrumentStreamEndKind,
    stats: { bytes: number; firstByteAt?: number; lastByteAt: number },
  ) => void;
  onError?: (error: unknown) => void;
};

const getHeader = (headers: Headers, name: string) => headers.get(name) ?? undefined;

export const getRequestMeta = (request?: Request): Record<string, unknown> => {
  if (!request) return {};

  let path = request.url;
  try {
    const url = new URL(request.url);
    path = url.pathname;
  } catch {
    path = request.url;
  }

  const headers = request.headers;
  return {
    method: request.method,
    path,
    contentType: getHeader(headers, "content-type"),
    contentLength: getHeader(headers, "content-length"),
    userAgent: getHeader(headers, "user-agent"),
  };
};

export const getAIMeta = (context?: Partial<GatewayContext>): Record<string, unknown> => {
  if (!context) return {};

  return {
    modelId: context.modelId,
    resolvedModelId: context.resolvedModelId,
    resolvedProviderId: context.resolvedProviderId,
  };
};

export const getResponseMeta = (result?: Response): Record<string, unknown> => {
  if (!result) return {};

  const headers = result.headers;
  return {
    status: result.status,
    statusText: result.statusText,
    contentType: getHeader(headers, "content-type"),
    contentLength: getHeader(headers, "content-length"),
  };
};

export const instrumentStream = (
  src: ReadableStream<Uint8Array>,
  hooks: InstrumentStreamHooks,
  signal?: AbortSignal,
): ReadableStream<Uint8Array> => {
  const stats = { bytes: 0, didFirstByte: false, firstByteAt: undefined as number | undefined };
  let done = false;

  const finish = (kind: InstrumentStreamEndKind, reason?: unknown) => {
    if (done) return;
    done = true;

    if (!reason) reason = signal?.reason;

    if (kind !== "completed") {
      hooks.onError?.(reason);
    }

    const timing = {
      bytes: stats.bytes,
      firstByteAt: stats.firstByteAt,
      lastByteAt: performance.now(),
    };

    hooks.onComplete?.(kind, timing);
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = src.getReader();

      try {
        for (;;) {
          if (signal?.aborted) {
            finish("cancelled", signal.reason);
            return;
          }

          // eslint-disable-next-line no-await-in-loop
          const { value, done } = await reader.read();
          if (done) break;

          if (!stats.didFirstByte) {
            stats.didFirstByte = true;
            stats.firstByteAt = performance.now();
          }

          stats.bytes += value!.byteLength;
          controller.enqueue(value!);
        }

        controller.close();
        finish("completed");
      } catch (err) {
        const kind =
          (err as any)?.name === "AbortError" || signal?.aborted ? "cancelled" : "errored";

        finish(kind, err);

        try {
          await src.cancel(err);
        } catch {}

        controller.close();
      } finally {
        try {
          reader.releaseLock();
        } catch {}
      }
    },

    cancel(reason) {
      finish("cancelled", reason);
      src.cancel(reason).catch(() => {});
    },
  });
};

export const withInstrumentation =
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
