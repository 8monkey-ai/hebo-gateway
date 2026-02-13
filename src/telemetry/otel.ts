import type { Attributes } from "@opentelemetry/api";
import type { Tracer } from "@opentelemetry/api";

import { SpanStatusCode } from "@opentelemetry/api";

import type { GatewayContext } from "../types";

import { initFetch } from "./fetch";
import { startSpan } from "./span";
import { instrumentStream } from "./stream";
import { getAIAttributes, getRequestAttributes, getResponseAttributes } from "./utils";

export const withOtel =
  (run: (ctx: GatewayContext) => Promise<void>, tracer?: Tracer) => async (ctx: GatewayContext) => {
    const requestStart = performance.now();
    const aiSpan = startSpan(ctx.request.url, undefined, tracer);
    initFetch();

    const endAiSpan = (status: number, stats?: { bytes: number }) => {
      const attrs: Attributes = getAIAttributes(ctx.body, ctx.result);

      attrs["gen_ai.server.request.duration"] = Number(
        ((performance.now() - requestStart) / 1000).toFixed(4),
      );

      if (!aiSpan.isExisting) {
        Object.assign(
          attrs,
          getRequestAttributes(ctx.request),
          getResponseAttributes(ctx.response),
        );
      }

      attrs["http.request.body.size"] = Number(ctx.request.headers.get("content-length") || 0);
      attrs["http.response.body.size"] =
        stats?.bytes ?? Number(attrs["http.response.header.content_length"] || 0);

      attrs["http.response.status_code_effective"] = status;

      aiSpan.setStatus({ code: status >= 500 ? SpanStatusCode.ERROR : SpanStatusCode.OK });

      if (ctx.operation && ctx.modelId) {
        aiSpan.updateName(`${ctx.operation} ${ctx.modelId}`);
      } else if (ctx.operation) {
        aiSpan.updateName(`${ctx.operation}`);
      }

      aiSpan.setAttributes(attrs);

      aiSpan.finish();
    };

    await aiSpan.runWithContext(() => run(ctx));

    if (ctx.response!.body instanceof ReadableStream) {
      const instrumented = instrumentStream(
        ctx.response!.body,
        {
          onComplete: (status, params) => endAiSpan(status, params),
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

    endAiSpan(ctx.response!.status);
  };
