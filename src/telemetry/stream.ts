type InstrumentStreamEndKind = "completed" | "cancelled" | "errored";

export type InstrumentStreamHooks = {
  onComplete?: (
    kind: InstrumentStreamEndKind,
    stats: { bytes: number; firstByteAt?: number; lastByteAt: number },
  ) => void;
  onError?: (error: unknown) => void;
};

export const instrumentStream = (
  src: ReadableStream<Uint8Array>,
  hooks: InstrumentStreamHooks,
  signal?: AbortSignal,
): ReadableStream<Uint8Array> => {
  const stats = { bytes: 0, didFirstByte: false, firstByteAt: undefined as number | undefined };
  let done = false;

  const finish = (kind: InstrumentStreamEndKind, reason?: unknown) => {
    if (done) return;
    done = true;

    if (!reason) reason = signal?.reason;

    if (kind !== "completed") {
      hooks.onError?.(reason);
    }

    const timing = {
      bytes: stats.bytes,
      firstByteAt: stats.firstByteAt,
      lastByteAt: performance.now(),
    };

    hooks.onComplete?.(kind, timing);
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = src.getReader();

      try {
        for (;;) {
          if (signal?.aborted) {
            finish("cancelled", signal.reason);
            return;
          }

          // eslint-disable-next-line no-await-in-loop
          const { value, done } = await reader.read();
          if (done) break;

          if (!stats.didFirstByte) {
            stats.didFirstByte = true;
            stats.firstByteAt = performance.now();
          }

          stats.bytes += value!.byteLength;
          controller.enqueue(value!);
        }

        controller.close();
        finish("completed");
      } catch (err) {
        const kind =
          (err as any)?.name === "AbortError" || signal?.aborted ? "cancelled" : "errored";

        finish(kind, err);

        try {
          await src.cancel(err);
        } catch {}

        controller.close();
      } finally {
        try {
          reader.releaseLock();
        } catch {}
      }
    },

    cancel(reason) {
      finish("cancelled", reason);
      src.cancel(reason).catch(() => {});
    },
  });
};
