import { toOpenAIError } from "../errors/openai";

const TEXT_ENCODER = new TextEncoder();

const SSE_DONE_CHUNK = TEXT_ENCODER.encode("data: [DONE]\n\n");
const SSE_KEEP_ALIVE_CHUNK = TEXT_ENCODER.encode(": keep-alive\n\n");

const SSE_DEFAULT_KEEP_ALIVE_MS = 20_000;

export type SseFrame<T = unknown, E extends string | undefined = string | undefined> = {
  data: T;
  event?: E;
};

export type SseErrorFrame = SseFrame<Error, "error" | undefined>;

export function toSseStream(
  src: ReadableStream<SseFrame>,
  options: {
    onDone?: (status: number, reason?: unknown) => void;
    keepAliveMs?: number;
  } = {},
): ReadableStream<Uint8Array> {
  const keepAliveMs = options.keepAliveMs ?? SSE_DEFAULT_KEEP_ALIVE_MS;
  let reader: ReadableStreamDefaultReader<SseFrame> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let finished = false;

  const done = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    status: number,
    reason?: unknown,
  ) => {
    if (finished) return;
    finished = true;
    if (timer) clearTimeout(timer);
    options.onDone?.(status, reason);
    try {
      controller.enqueue(SSE_DONE_CHUNK);
    } catch {}
    try {
      controller.close();
    } catch {}
  };

  const heartbeat = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (timer) clearTimeout(timer);
    if (!keepAliveMs || keepAliveMs <= 0 || finished) return;

    timer = setTimeout(() => {
      if (finished) return;
      try {
        controller.enqueue(SSE_KEEP_ALIVE_CHUNK);
        heartbeat(controller);
      } catch {}
    }, keepAliveMs);
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      reader = src.getReader();
      heartbeat(controller);
    },

    async pull(controller) {
      if (finished) return;

      try {
        // oxlint-disable-next-line no-await-in-loop
        const result = await reader!.read();
        if (result.done) {
          done(controller, 200);
          return;
        }

        const value = result.value;
        if (value.event === "error" || value.data instanceof Error) {
          const error = toOpenAIError(value.data);
          controller.enqueue(
            TEXT_ENCODER.encode(serializeSseFrame({ event: value.event, data: error })),
          );
          done(controller, error.error.type === "invalid_request_error" ? 422 : 502, value.data);
          reader!.cancel(value.data).catch(() => {});
          return;
        }

        controller.enqueue(TEXT_ENCODER.encode(serializeSseFrame(value)));
        heartbeat(controller);
      } catch (error) {
        try {
          controller.enqueue(
            TEXT_ENCODER.encode(
              serializeSseFrame({
                event: "error",
                data: toOpenAIError(error),
              }),
            ),
          );
        } catch {}
        done(controller, 502, error);
      }
    },

    cancel(reason) {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      options.onDone?.(499, reason);
      return reader?.cancel(reason).catch(() => {});
    },
  });
}

function serializeSseFrame(frame: SseFrame): string {
  let out = "";

  if (frame.event) {
    out += `event: ${frame.event}\n`;
  }

  out += `data: ${JSON.stringify(frame.data)}\n\n`;
  return out;
}
