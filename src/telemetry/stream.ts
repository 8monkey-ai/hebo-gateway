import { toOpenAIError } from "../errors/openai";

const isErrorChunk = (v: unknown) => v instanceof Error || !!(v as any)?.error;

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
          // oxlint-disable-next-line no-await-in-loop
          const { value, done: eof } = await reader.read();
          if (eof) break;

          const out = isErrorChunk(value) ? toOpenAIError(value) : value;
          controller.enqueue(out);

          if (out !== value) {
            const status = out.error?.type === "invalid_request_error" ? 422 : 502;
            done(controller, status, value);
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
