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
  } else if (result instanceof Error) {
    body = TEXT_ENCODER.encode(JSON.stringify({ message: result.message }));
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
