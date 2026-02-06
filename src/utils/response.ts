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
  if (isStream || typeof result === "string" || result instanceof Uint8Array) {
    body = result;
  } else {
    body = JSON.stringify(result);
  }

  const init = mergeResponseInit(
    isStream
      ? {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        }
      : { "Content-Type": "application/json" },
    responseInit,
  );

  return new Response(body, init);
};

export type StreamResponseHooks = {
  onComplete?: (stats: { streamBytes: number; firstByteAt?: number; lastByteAt: number }) => void;
  onError?: (error: unknown) => void;
};

export const wrapStreamResponse = (response: Response, hooks: StreamResponseHooks): Response => {
  let streamBytes = 0;
  let didFirstByte = false;
  let firstByteAt: number | undefined;
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      if (!didFirstByte) {
        didFirstByte = true;
        firstByteAt = performance.now();
      }
      streamBytes += chunk.byteLength;
      controller.enqueue(chunk);
    },
    flush() {
      hooks.onComplete?.({ streamBytes, firstByteAt, lastByteAt: performance.now() });
    },
  });

  response.body?.pipeTo(writable).catch((error) => {
    hooks.onError?.(error);
    hooks.onComplete?.({ streamBytes, firstByteAt, lastByteAt: performance.now() });
  });

  return new Response(readable, response);
};
