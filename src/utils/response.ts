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

export type StreamResponseHooks = {
  onComplete?: (
    stats: { bytes: number; firstByteAt?: number; lastByteAt: number },
    aborted: boolean,
  ) => void;
  onError?: (error: unknown) => void;
};

export const wrapStreamResponse = (
  response: Response,
  hooks: StreamResponseHooks,
  signal?: AbortSignal,
): Response => {
  const stats = {
    bytes: 0,
    didFirstByte: false,
    firstByteAt: undefined as number | undefined,
  };
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      if (!stats.didFirstByte) {
        stats.didFirstByte = true;
        stats.firstByteAt = performance.now();
      }
      stats.bytes += chunk.byteLength;
      controller.enqueue(chunk);
    },
    flush() {
      hooks.onComplete?.(
        {
          bytes: stats.bytes,
          firstByteAt: stats.firstByteAt,
          lastByteAt: performance.now(),
        },
        false,
      );
    },
  });

  response.body?.pipeTo(writable, signal ? { signal } : undefined).catch((reason) => {
    if (reason !== undefined) hooks.onError?.(reason);
    hooks.onComplete?.(
      {
        bytes: stats.bytes,
        firstByteAt: stats.firstByteAt,
        lastByteAt: performance.now(),
      },
      true,
    );
  });

  return new Response(readable, response);
};
