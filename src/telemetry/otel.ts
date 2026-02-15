import type { Attributes } from "@opentelemetry/api";

import type { GatewayConfigParsed, GatewayContext } from "../types";

import {
  getAIAttributes,
  getBaggageAttributes,
  getRequestAttributes,
  getResponseAttributes,
} from "./attributes";
import { recordRequestDuration as requestOperationDuration, recordTokenUsage } from "./metric";
import { recordSpanError, startSpan } from "./span";
import { instrumentStream } from "./stream";

export const withOtel =
  (run: (ctx: GatewayContext) => Promise<void>, config: GatewayConfigParsed) =>
  async (ctx: GatewayContext) => {
    const requestStart = performance.now();
    const aiSpan = startSpan(ctx.request.url);

    const endAiSpan = (status: number, reason?: unknown, stats?: { bytes: number }) => {
      const attrs: Attributes = getAIAttributes(
        ctx.operation,
        ctx.body,
        ctx.streamResult ?? ctx.result,
        config.telemetry?.attributes?.gen_ai,
        ctx.resolvedProviderId,
      );

      if (!aiSpan.isExisting) {
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

      requestOperationDuration(performance.now() - requestStart, attrs, ctx.response?.statusText);
      recordTokenUsage(attrs, ctx.response?.statusText);

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
        { onDone: endAiSpan },
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
