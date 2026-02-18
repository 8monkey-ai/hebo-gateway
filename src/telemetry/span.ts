import type { Attributes, SpanOptions, Tracer } from "@opentelemetry/api";

import { INVALID_SPAN_CONTEXT, SpanKind, SpanStatusCode, context, trace } from "@opentelemetry/api";

import type { TelemetrySignalLevel } from "../types";

const DEFAULT_TRACER_NAME = "@hebo/gateway";

let spanTracer: Tracer | undefined;
let spanEventsEnabled = false;

const NOOP_SPAN = {
  runWithContext: <T>(fn: () => Promise<T> | T) => fn(),
  recordError: (_error: unknown) => {},
  finish: () => {},
  isExisting: true,
};

export const setSpanTracer = (tracer?: Tracer) => {
  spanTracer = tracer ?? trace.getTracer(DEFAULT_TRACER_NAME);
};

export const setSpanEventsEnabled = (level?: TelemetrySignalLevel) => {
  spanEventsEnabled = level === "recommended" || level === "full";
};

export const startSpan = (name: string, options?: SpanOptions) => {
  if (!spanTracer) {
    return Object.assign(trace.wrapSpanContext(INVALID_SPAN_CONTEXT), NOOP_SPAN);
  }

  const parentContext = context.active();
  const activeSpan = trace.getActiveSpan();

  const span = spanTracer.startSpan(
    name,
    { kind: activeSpan ? SpanKind.INTERNAL : SpanKind.SERVER, ...options },
    parentContext,
  );

  const runWithContext = <T>(fn: () => Promise<T> | T) =>
    context.with(trace.setSpan(parentContext, span), fn);

  const recordError = (error: unknown) => {
    const err = error instanceof Error ? error : new Error(String(error));
    span.recordException(err);
    span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
  };

  const finish = () => {
    span.end();
  };

  return Object.assign(span, { runWithContext, recordError, finish, isExisting: !!activeSpan });
};

export const withSpan = async <T>(
  name: string,
  run: () => Promise<T> | T,
  options?: SpanOptions,
): Promise<T> => {
  if (!spanTracer) {
    return await run();
  }

  const started = startSpan(name, options);
  try {
    return await started.runWithContext(run);
  } catch (error) {
    started.recordError(error);
    throw error;
  } finally {
    started.finish();
  }
};

export const addSpanEvent = (name: string, attributes?: Attributes) => {
  if (!spanEventsEnabled) return;
  trace.getActiveSpan()?.addEvent(name, attributes);
};

export const setSpanAttributes = (attributes?: Attributes) => {
  if (!attributes) return;
  trace.getActiveSpan()?.setAttributes(attributes);
};
