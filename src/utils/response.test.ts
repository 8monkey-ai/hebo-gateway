import { describe, expect, test } from "bun:test";

import { toResponse, toSseStream } from "./response";

const readResponseBody = async (response: Response) => {
  return response.text();
};

describe("toResponse", () => {
  test("serializes SSE streams without keep-alives when the stream finishes immediately", async () => {
    const response = toResponse(
      new ReadableStream({
        start(controller) {
          controller.enqueue({ hello: "world" });
          controller.close();
        },
      }),
    );

    const body = await readResponseBody(response);

    expect(body).toBe('data: {"hello":"world"}\n\ndata: [DONE]\n\n');
  });

  test("emits SSE keep-alive comments while waiting for the first chunk", async () => {
    const response = new Response(
      toSseStream(
        new ReadableStream({
          start(controller) {
            const enqueueTimer = setTimeout(() => {
              controller.enqueue({ hello: "world" });
              controller.close();
            }, 30);

            return () =>{  clearTimeout(enqueueTimer); };
          },
        }),
        10,
      ),
    );

    const body = await readResponseBody(response);

    expect(body).toContain(": keep-alive\n\n");
    expect(body).toContain('data: {"hello":"world"}\n\n');
    expect(body.endsWith("data: [DONE]\n\n")).toBe(true);
  });
});
