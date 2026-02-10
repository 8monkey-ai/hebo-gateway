import { REQUEST_ID_HEADER, resolveRequestId } from "./headers";

const TEXT_ENCODER = new TextEncoder();

export const prepareResponseInit = (request: Request): ResponseInit => ({
  headers: { [REQUEST_ID_HEADER]: resolveRequestId(request.headers)! },
});

export const mergeResponseInit = (
  defaultHeaders: HeadersInit,
  responseInit?: ResponseInit,
): ResponseInit => {
  const headers = new Headers(defaultHeaders);
  const override = responseInit?.headers;
  if (override) {
    new Headers(override).forEach((value, key) => headers.set(key, value));
  }
  if (!responseInit) return { headers };

  return {
    status: responseInit.status,
    statusText: responseInit.statusText,
    headers,
  };
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
  const isError = result instanceof Error;

  if (!responseInit?.statusText) {
    const status = responseInit?.status ?? (isError ? 500 : 200);
    const statusText = isError ? "REQUEST_FAILED" : "OK";
    const headers = responseInit?.headers;

    responseInit = headers ? { status, statusText, headers } : { status, statusText };
  }

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
