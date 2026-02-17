import { toOpenAIError } from "#/errors/openai";

const isErrorChunk = (v: unknown) => v instanceof Error || !!(v as any)?.error;

export const wrapStream = (
  src: ReadableStream,
  hooks: { onDone?: (status: number, reason: unknown) => void },
): ReadableStream => {
  let finished = false;

  const done = (
    reader: ReadableStreamDefaultReader,
    controller: ReadableStreamDefaultController,
    status: number,
    reason?: unknown,
  ) => {
    if (!finished) {
      finished = true;
      hooks.onDone?.(status, reason);
    }
    reader.cancel(reason).catch(() => {});
    controller.close();
  };

  return new ReadableStream({
    async start(controller) {
      const reader = src.getReader();

      try {
        for (;;) {
          // eslint-disable-next-line no-await-in-loop
          const { value, done: eof } = await reader.read();
          if (eof) break;

          const out = isErrorChunk(value) ? toOpenAIError(value) : value;
          controller.enqueue(out);

          if (out !== value) {
            const status = out.error?.type === "invalid_request_error" ? 422 : 502;
            done(reader, controller, status, value);
            return;
          }
        }

        done(reader, controller, 200);
      } catch (err) {
        controller.enqueue(toOpenAIError(err));
        done(reader, controller, 502, err);
      } finally {
        try {
          reader.releaseLock();
        } catch {}
      }
    },

    cancel(reason) {
      if (!finished) {
        finished = true;
        hooks.onDone?.(499, reason);
      }
      src.cancel(reason).catch(() => {});
    },
  });
};
