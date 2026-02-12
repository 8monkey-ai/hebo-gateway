import type { Attributes } from "@opentelemetry/api";
import type { Tracer } from "@opentelemetry/api";

import { SpanStatusCode } from "@opentelemetry/api";

import type { GatewayContext } from "../types";

import { resolveRequestId } from "../utils/headers";
import { initFetch } from "./fetch";
import { startSpan } from "./span";
import { instrumentStream } from "./stream";
import { getAIAttributes, getRequestAttributes, getResponseAttributes } from "./utils";

export const withRootSpan =
  (run: (ctx: GatewayContext) => Promise<void>, tracer?: Tracer) => async (ctx: GatewayContext) => {
    const requestStart = performance.now();
    const rootSpan = startSpan(ctx.request.url, undefined, tracer, true);
    initFetch();

    const endAccessSpan = (status: number, stats?: { bytes: number }) => {
      const attrs: Attributes = Object.assign(
        {},
        getRequestAttributes(ctx.request),
        getResponseAttributes(ctx.response),
        getAIAttributes(ctx),
      );

      attrs["request.id"] = resolveRequestId(ctx.request);
      attrs["http.response.status_code_effective"] =
        status === 200 ? (ctx.response?.status ?? status) : status;
      attrs["network.io.bytes_in"] = Number(ctx.request.headers.get("content-length"));
      attrs["network.io.bytes_out"] =
        stats?.bytes ?? Number(attrs["http.response.header.content_length"]);
      attrs["http.server.duration"] = performance.now() - requestStart;

      rootSpan.setAttributes(attrs);

      rootSpan.setStatus({ code: status === 200 ? SpanStatusCode.OK : SpanStatusCode.ERROR });

      rootSpan.finish();
    };

    await rootSpan.runWithContext(() => run(ctx));

    if (ctx.response!.body instanceof ReadableStream) {
      const instrumented = instrumentStream(
        ctx.response!.body,
        {
          onComplete: (status, params) => endAccessSpan(status, params),
        },
        ctx.request.signal,
      );

      ctx.response = new Response(instrumented, {
        status: ctx.response!.status,
        statusText: ctx.response!.statusText,
        headers: ctx.response!.headers,
      });
      return;
    }

    endAccessSpan(ctx.response!.status);
  };
