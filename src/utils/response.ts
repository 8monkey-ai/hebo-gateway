import { REQUEST_ID_HEADER } from "./headers";
import type { SseFrame } from "./stream";
import { toSseStream } from "./stream";

const TEXT_ENCODER = new TextEncoder();

export const prepareResponseInit = (requestId: string): ResponseInit => ({
  headers: { [REQUEST_ID_HEADER]: requestId },
});

export const mergeResponseInit = (
  defaultHeaders: HeadersInit,
  responseInit?: ResponseInit,
): ResponseInit => {
  const headers = new Headers(defaultHeaders);
  const override = responseInit?.headers;
  if (override) {
    new Headers(override).forEach((value, key) => {
      headers.set(key, value);
    });
  }
  if (!responseInit) return { headers };

  return {
    status: responseInit.status,
    statusText: responseInit.statusText,
    headers,
  };
};

export const toResponse = (
  result: ReadableStream<SseFrame> | Uint8Array<ArrayBuffer> | object | string,
  responseInit?: ResponseInit,
  streamOptions?: {
    onDone?: (status: number, reason?: unknown) => void;
    formatError?: (error: unknown) => unknown;
  },
): Response => {
  let body: BodyInit;
  const isStream = result instanceof ReadableStream;

  if (isStream) {
    body = toSseStream(result, streamOptions);
  } else if (result instanceof Uint8Array) {
    body = result;
  } else if (typeof result === "string") {
    body = TEXT_ENCODER.encode(result);
  } else {
    body = TEXT_ENCODER.encode(JSON.stringify(result));
  }

  if (!responseInit?.statusText) {
    const status = responseInit?.status ?? 200;
    const statusText = "OK";
    const headers = responseInit?.headers;

    responseInit = headers ? { status, statusText, headers } : { status, statusText };
  }

  const init = mergeResponseInit(
    isStream
      ? {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        }
      : {
          "content-type": "application/json",
          "content-length": String((body as Uint8Array).byteLength),
        },
    responseInit,
  );

  return new Response(body, init);
};
