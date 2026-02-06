const TEXT_ENCODER = new TextEncoder();

export const mergeResponseInit = (
  defaultHeaders: HeadersInit,
  responseInit?: ResponseInit,
): ResponseInit => {
  const headers = new Headers(defaultHeaders);
  const override = responseInit?.headers;
  if (override) {
    new Headers(override).forEach((value, key) => headers.set(key, value));
  }
  return responseInit ? { ...responseInit, headers } : { headers };
};

export const toResponse = (
  result: ReadableStream<Uint8Array> | Uint8Array<ArrayBuffer> | object | string,
  responseInit?: ResponseInit,
): Response => {
  let body: BodyInit;

  const isStream = result instanceof ReadableStream;
  if (isStream || result instanceof Uint8Array) {
    body = result;
  } else if (typeof result === "string") {
    body = TEXT_ENCODER.encode(result);
  } else {
    body = TEXT_ENCODER.encode(JSON.stringify(result));
  }

  const contentLength = body instanceof Uint8Array ? String(body.byteLength) : "";

  if (!responseInit)
    responseInit =
      result instanceof Error
        ? { status: 500, statusText: "REQUEST_FAILED" }
        : { status: 200, statusText: "OK" };

  const init = mergeResponseInit(
    isStream
      ? {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          Connection: "keep-alive",
        }
      : {
          "content-type": "application/json",
          "content-length": contentLength,
        },
    responseInit,
  );

  return new Response(body, init);
};

type StreamEndKind = "completed" | "cancelled" | "errored";

export type StreamResponseHooks = {
  onComplete?: (
    kind: StreamEndKind,
    stats: { bytes: number; firstByteAt?: number; lastByteAt: number },
  ) => void;
  onError?: (error: unknown) => void;
};

export const wrapStreamResponse = (
  response: Response,
  hooks: StreamResponseHooks,
  signal?: AbortSignal,
): Response => {
  const src = response.body;
  if (!src) return response;

  const stats = { bytes: 0, didFirstByte: false, firstByteAt: undefined as number | undefined };
  let done = false;

  const finish = (kind: StreamEndKind, reason?: unknown) => {
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

  const out = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = src.getReader();

      try {
        for (;;) {
          if (signal?.aborted) {
            finish("cancelled", signal.reason);
            return;
          }

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
        controller.close();

        const kind =
          (err as any)?.name === "AbortError" || signal?.aborted ? "cancelled" : "errored";

        finish(kind, err);
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

  return new Response(out, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
};
