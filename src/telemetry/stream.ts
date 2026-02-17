import { toOpenAIError } from "#/errors/openai";

const isErrorChunk = (v: unknown) => v instanceof Error || !!(v as any)?.error;

export const wrapStream = (
  src: ReadableStream,
  hooks: { onDone?: (status: number, reason: unknown) => void },
  signal?: AbortSignal,
): ReadableStream => {
  let finishOnce = false;

  const finish = (status: number, reason?: unknown) => {
    if (finishOnce) return;
    finishOnce = true;

    hooks.onDone?.(status, reason ?? signal?.reason);
  };

  return new ReadableStream({
    async start(controller) {
      const reader = src.getReader();

      const close = (status: number, reason?: unknown) => {
        finish(status, reason);
        reader.cancel(reason).catch(() => {});
        controller.close();
      };

      try {
        for (;;) {
          if (signal?.aborted) {
            close(499, signal.reason);
            return;
          }

          // eslint-disable-next-line no-await-in-loop
          const { value, done } = await reader.read();
          if (done) break;

          if (isErrorChunk(value)) {
            const openAiError = toOpenAIError(value);
            const status = openAiError.error.type === "invalid_request_error" ? 422 : 502;
            controller.enqueue(openAiError);
            close(status, value);
            return;
          }

          controller.enqueue(value);
        }

        finish(200);
        controller.close();
      } catch (err) {
        const status = signal?.aborted ? 499 : (err as any)?.name === "AbortError" ? 503 : 502;
        close(status, err);
      } finally {
        try {
          reader.releaseLock();
        } catch {}
      }
    },

    cancel(reason?: unknown) {
      finish(499, reason);
      src.cancel(reason).catch(() => {});
    },
  });
};
