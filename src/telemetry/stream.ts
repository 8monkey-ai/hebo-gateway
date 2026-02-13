export type InstrumentStreamHooks = {
  onComplete?: (status: number, stats: { bytes: number }) => void;
  onError?: (error: unknown, status: number) => void;
};

export const instrumentStream = (
  src: ReadableStream<Uint8Array>,
  hooks: InstrumentStreamHooks,
  signal?: AbortSignal,
): ReadableStream<Uint8Array> => {
  const stats = { bytes: 0 };
  let done = false;

  const finish = (status: number, reason?: unknown) => {
    if (done) return;
    done = true;

    if (!reason) reason = signal?.reason;

    if (status >= 400) {
      hooks.onError?.(reason, status);
    }

    hooks.onComplete?.(status, stats);
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = src.getReader();

      try {
        for (;;) {
          if (signal?.aborted) {
            finish(499, signal.reason);
            reader.cancel(signal.reason).catch(() => {});
            controller.close();
            return;
          }

          // eslint-disable-next-line no-await-in-loop
          const { value, done } = await reader.read();
          if (done) break;

          stats.bytes += value!.byteLength;
          controller.enqueue(value!);
        }

        finish(200);
        controller.close();
      } catch (err) {
        const status = signal?.aborted ? 499 : (err as any)?.name === "AbortError" ? 503 : 502;

        finish(status, err);
        reader.cancel(err).catch(() => {});
        controller.close();
      } finally {
        try {
          reader.releaseLock();
        } catch {}
      }
    },

    cancel(reason) {
      finish(499, reason);
      src.cancel(reason).catch(() => {});
    },
  });
};
