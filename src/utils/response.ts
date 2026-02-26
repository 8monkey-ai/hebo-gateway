import { REQUEST_ID_HEADER } from "./headers";

const TEXT_ENCODER = new TextEncoder();

class JsonToSseTransformStream extends TransformStream<unknown, string> {
  constructor() {
    super({
      transform(part, controller) {
        const eventType =
          part &&
          typeof part === "object" &&
          "type" in part &&
          typeof (part as Record<string, unknown>)["type"] === "string"
            ? ((part as Record<string, unknown>)["type"] as string)
            : undefined;

        if (eventType) {
          controller.enqueue(`event: ${eventType}\n`);
        }
        controller.enqueue(`data: ${JSON.stringify(part)}\n\n`);
      },
      flush(controller) {
        controller.enqueue("data: [DONE]\n\n");
      },
    });
  }
}

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
  result: ReadableStream | Uint8Array<ArrayBuffer> | object | string,
  responseInit?: ResponseInit,
): Response => {
  let body: BodyInit;

  const isStream = result instanceof ReadableStream;
  if (isStream) {
    body = result.pipeThrough(new JsonToSseTransformStream()).pipeThrough(new TextEncoderStream());
  } else if (result instanceof Uint8Array) {
    body = result;
  } else if (typeof result === "string") {
    body = TEXT_ENCODER.encode(result);
  } else if (result instanceof Error) {
    body = TEXT_ENCODER.encode(JSON.stringify({ message: result.message }));
  } else {
    body = TEXT_ENCODER.encode(JSON.stringify(result));
  }

  if (!responseInit?.statusText) {
    const isError = result instanceof Error;

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
