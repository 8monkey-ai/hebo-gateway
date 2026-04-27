import { describe, expect, test } from "bun:test";

import { toSseStream, type SseFrame } from "./stream";

describe("stream utils", () => {
  test("serializes frames as SSE and appends done", async () => {
    const response = new Response(
      toSseStream(
        new ReadableStream<SseFrame>({
          start(controller) {
            controller.enqueue({ data: { hello: "world" } });
            controller.close();
          },
        }),
      ),
    );

    expect(await response.text()).toBe('data: {"hello":"world"}\n\ndata: [DONE]\n\n');
  });

  test("serializes multiple frames across pull cycles", async () => {
    const response = new Response(
      toSseStream(
        new ReadableStream<SseFrame>({
          start(controller) {
            controller.enqueue({ data: { hello: "world" } });
            controller.enqueue({ data: { goodbye: "moon" } });
            controller.close();
          },
        }),
      ),
    );

    expect(await response.text()).toBe(
      'data: {"hello":"world"}\n\ndata: {"goodbye":"moon"}\n\ndata: [DONE]\n\n',
    );
  });

  test("emits keep-alive comments while waiting for the first frame", async () => {
    const response = new Response(
      toSseStream(
        new ReadableStream<SseFrame>({
          start(controller) {
            const enqueueTimer = setTimeout(() => {
              controller.enqueue({ data: { hello: "world" } });
              controller.close();
            }, 30);

            return () => {
              clearTimeout(enqueueTimer);
            };
          },
        }),
        { keepAliveMs: 10 },
      ),
    );

    const body = await response.text();

    expect(body).toContain(": keep-alive\n\n");
    expect(body).toContain('data: {"hello":"world"}\n\n');
    expect(body.endsWith("data: [DONE]\n\n")).toBe(true);
  });

  test("forwards undefined reason to onDone when the consumer cancels", async () => {
    const calls: Array<{ status: number; reason: unknown }> = [];

    const stream = toSseStream(
      new ReadableStream<SseFrame>({
        start(controller) {
          controller.enqueue({ data: { hello: "world" } });
        },
      }),
      {
        onDone: (status, reason) => {
          calls.push({ status, reason });
        },
      },
    );

    const reader = stream.getReader();
    await reader.read();
    await reader.cancel();

    expect(calls).toEqual([{ status: 499, reason: undefined }]);
  });

  test("stringifies normalized stream errors", async () => {
    const response = new Response(
      toSseStream(
        new ReadableStream<SseFrame>({
          start(controller) {
            controller.enqueue({
              event: "error",
              data: new Error("boom"),
            });
            controller.close();
          },
        }),
        {
          toError: (e) => ({
            error: {
              message: e instanceof Error ? e.message : String(e),
              type: "server_error",
            },
          }),
        },
      ),
    );

    const body = await response.text();

    expect(body).toContain("event: error\n");
    expect(body).toContain('data: {"error":{"message":"boom","type":"server_error"');
    expect(body.endsWith("data: [DONE]\n\n")).toBe(true);
  });
});
