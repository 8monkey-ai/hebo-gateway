import { toOpenAIError } from "../errors/openai";

const isErrorChunk = (v: unknown): v is Error | { error: unknown } =>
  v instanceof Error || (typeof v === "object" && v !== null && "error" in v);

export const wrapStream = (
  src: ReadableStream,
  hooks: { onDone?: (status: number, reason: unknown) => void },
): ReadableStream => {
  let finished = false;
  let reader: ReadableStreamDefaultReader | undefined;

  const done = (controller: ReadableStreamDefaultController, status: number, reason?: unknown) => {
    if (finished) return;
    finished = true;
    hooks.onDone?.(status, reason);
    if (status !== 200) {
      reader?.cancel(reason).catch(() => {});
    }
    try {
      controller.close();
    } catch {}
  };

  return new ReadableStream({
    async start(controller) {
      reader = src.getReader();

      try {
        for (;;) {
          // oxlint-disable-next-line no-await-in-loop, no-unsafe-assignment
          const { value, done: eof } = await reader.read();
          if (eof) break;

          controller.enqueue(value);

          if (isErrorChunk(value)) {
            done(
              controller,
              toOpenAIError(value).error.type === "invalid_request_error" ? 422 : 502,
              value,
            );
            return;
          }
        }

        done(controller, 200);
      } catch (err) {
        try {
          controller.enqueue(toOpenAIError(err));
        } catch {}
        done(controller, 502, err);
      } finally {
        try {
          reader?.releaseLock();
        } catch {}
      }
    },

    cancel(reason) {
      if (finished) return;
      finished = true;
      hooks.onDone?.(499, reason);
      reader?.cancel(reason).catch(() => {});
    },
  });
};
