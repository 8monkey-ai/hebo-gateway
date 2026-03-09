import { REQUEST_ID_HEADER } from "./headers";

const TEXT_ENCODER = new TextEncoder();

const SSE_KEEP_ALIVE = TEXT_ENCODER.encode(": keep-alive\n\n");
const SSE_DONE = TEXT_ENCODER.encode("data: [DONE]\n\n");
const SSE_DEFAULT_KEEP_ALIVE_MS = 20_000;

export const toSseStream = (
  src: ReadableStream<unknown>,
  keepAliveMs: number = SSE_DEFAULT_KEEP_ALIVE_MS,
): ReadableStream<Uint8Array> => {
  let reader: ReadableStreamDefaultReader<unknown> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let finished = false;

  const heartbeat = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (timer) clearTimeout(timer);
    if (!keepAliveMs || keepAliveMs <= 0 || finished) return;

    timer = setTimeout(() => {
      if (finished) return;
      controller.enqueue(SSE_KEEP_ALIVE);
      heartbeat(controller);
    }, keepAliveMs);
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      reader = src.getReader();
      heartbeat(controller);

      void (async () => {
        try {
          for (;;) {
            // oxlint-disable-next-line no-await-in-loop
            const { value, done } = await reader.read();
            if (done) break;
            controller.enqueue(TEXT_ENCODER.encode(`data: ${JSON.stringify(value)}\n\n`));
            heartbeat(controller);
          }

          finished = true;
          if (timer) clearTimeout(timer);
          controller.enqueue(SSE_DONE);
          controller.close();
        } catch (error) {
          finished = true;
          if (timer) clearTimeout(timer);
          controller.error(error);
        } finally {
          try {
            reader?.releaseLock();
          } catch {}
        }
      })();
    },

    cancel(reason) {
      finished = true;
      if (timer) clearTimeout(timer);
      return reader?.cancel(reason).catch(() => {});
    },
  });
};

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
  result: ReadableStream | Uint8Array<ArrayBuffer> | object | string,
  responseInit?: ResponseInit,
): Response => {
  let body: BodyInit;

  const isStream = result instanceof ReadableStream;
  if (isStream) {
    body = toSseStream(result);
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
