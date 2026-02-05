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
  result: ReadableStream | object | string,
  responseInit?: ResponseInit,
): Response => {
  const isStream = result instanceof ReadableStream;
  let body: BodyInit;

  if (isStream) {
    body = result;
  } else {
    body = typeof result === "string" ? result : JSON.stringify(result);
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
  onComplete?: (stats: { streamBytes: number }) => void;
  onError?: (error: unknown) => void;
};

export const wrapStreamResponse = (response: Response, hooks: StreamResponseHooks): Response => {
  let streamBytes = 0;
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      streamBytes += chunk.byteLength;
      controller.enqueue(chunk);
    },
    flush() {
      hooks.onComplete?.({ streamBytes });
    },
  });

  response.body?.pipeTo(writable).catch((error) => {
    hooks.onError?.(error);
    hooks.onComplete?.({ streamBytes });
  });

  return new Response(readable, response);
};
