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
      ),
    );

    const body = await response.text();

    expect(body).toContain("event: error\n");
    expect(body).toContain('data: {"error":{"message":"boom","type":"server_error"');
    expect(body.endsWith("data: [DONE]\n\n")).toBe(true);
  });
});
