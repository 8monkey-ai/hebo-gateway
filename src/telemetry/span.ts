import type { Attributes, SpanOptions, Tracer } from "@opentelemetry/api";
import { INVALID_SPAN_CONTEXT, SpanKind, SpanStatusCode, context, trace } from "@opentelemetry/api";

import type { TelemetrySignalLevel } from "../types";

const DEFAULT_TRACER_NAME = "@hebo/gateway";

let spanTracer: Tracer | undefined;
let spanEventsEnabled = false;

const toErrorMessage = (error: unknown): string => {
  if (error === null || error === undefined) return "Unknown error";
  if (typeof error === "string") return error;
  if (typeof error === "number" || typeof error === "boolean" || typeof error === "bigint") {
    return String(error);
  }
  if (typeof error === "object" && typeof (error as { message?: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  try {
    return JSON.stringify(error) ?? "Unknown error";
  } catch {
    return "Unknown error";
  }
};

const NOOP_SPAN = {
  runWithContext: <T>(fn: () => Promise<T> | T) => fn(),
  recordError: (_error: unknown, _setError: boolean) => {},
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

  const recordError = (error: unknown, setError: boolean) => {
    const err = error instanceof Error ? error : new Error(toErrorMessage(error));
    span.recordException(err);
    if (setError) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    }
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
    return run();
  }

  const started = startSpan(name, options);
  try {
    return await started.runWithContext(run);
  } catch (error) {
    started.recordError(error, true);
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
