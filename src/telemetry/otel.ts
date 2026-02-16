import type { Attributes } from "@opentelemetry/api";

import type { GatewayConfigParsed, GatewayContext } from "../types";

import { getBaggageAttributes, getRequestAttributes, getResponseAttributes } from "./attributes";
import { recordSpanError, startSpan } from "./span";
import { instrumentStream } from "./stream";

export const withOtel =
  (run: (ctx: GatewayContext) => Promise<void>, config: GatewayConfigParsed) =>
  async (ctx: GatewayContext) => {
    const span = startSpan(ctx.request.url);

    const finalize = (status: number, reason?: unknown, stats?: { bytes: number }) => {
      const attrs: Attributes = {};

      if (!span.isExisting) {
        Object.assign(
          attrs,
          getRequestAttributes(ctx.request, config.telemetry?.attributes?.http),
          getResponseAttributes(ctx.response, config.telemetry?.attributes?.http),
        );
      }

      Object.assign(attrs, getBaggageAttributes(ctx.request));

      if (config.telemetry?.attributes?.http !== "required") {
        attrs["http.request.body.size"] = Number(ctx.request.headers.get("content-length") || 0);
        attrs["http.response.body.size"] =
          stats?.bytes ?? Number(attrs["http.response.header.content-length"] || 0);
      }

      if (config.telemetry?.attributes?.http === "full") {
        attrs["http.request.body"] = JSON.stringify(ctx.body);
      }

      const realStatus = status === 200 ? (ctx.response?.status ?? status) : status;
      attrs["http.response.status_code_effective"] = realStatus;
      if (realStatus >= 500) recordSpanError(reason);

      if (ctx.operation && ctx.modelId) {
        span.updateName(`${ctx.operation} ${ctx.modelId}`);
      } else if (ctx.operation) {
        span.updateName(`${ctx.operation}`);
      }

      span.setAttributes(attrs);

      span.finish();
    };

    await span.runWithContext(() => run(ctx));

    if (ctx.response!.body instanceof ReadableStream) {
      const instrumented = instrumentStream(
        ctx.response!.body,
        { onDone: finalize },
        ctx.request.signal,
      );

      ctx.response = new Response(instrumented, {
        status: ctx.response!.status,
        statusText: ctx.response!.statusText,
        headers: ctx.response!.headers,
      });
      return;
    }

    finalize(ctx.response!.status);
  };
