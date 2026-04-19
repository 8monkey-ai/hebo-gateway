import { buildRetryHeaders, filterResponseHeaders, REQUEST_ID_HEADER } from "./headers";
import type { SseFrame } from "./stream";
import { toSseStream } from "./stream";

const TEXT_ENCODER = new TextEncoder();

export const prepareResponseInit = (requestId: string, upstream?: ResponseInit): ResponseInit => {
  const init = upstream ?? {};
  init.headers = filterResponseHeaders(upstream?.headers);
  if (init.status && init.status >= 400)
    init.headers = buildRetryHeaders(init.status, init.headers);
  init.headers[REQUEST_ID_HEADER] = requestId;
  return init;
};

export const mergeResponseInit = (
  headers: Record<string, string>,
  responseInit?: ResponseInit,
): ResponseInit => {
  if (!responseInit) return { headers };

  const override = responseInit?.headers;
  if (override) {
    new Headers(override).forEach((value, key) => {
      headers[key] = value;
    });
  }

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
    toError?: (error: unknown) => unknown;
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
