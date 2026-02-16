import type { Attributes, SpanOptions, Tracer } from "@opentelemetry/api";

import { INVALID_SPAN_CONTEXT, SpanKind, SpanStatusCode, context, trace } from "@opentelemetry/api";

const DEFAULT_TRACER_NAME = "@hebo-ai/gateway";

let spanTracer: Tracer | undefined;

const toError = (error: unknown) => (error instanceof Error ? error : new Error(String(error)));

const NOOP_SPAN = {
  runWithContext: <T>(fn: () => Promise<T> | T) => fn(),
  recordError: (_error: unknown) => {},
  finish: () => {},
  isExisting: true,
};

export const setSpanTracer = (tracer?: Tracer) => {
  spanTracer = tracer;
};

export const startSpan = (name: string, options?: SpanOptions) => {
  const tracer = spanTracer ?? trace.getTracer(DEFAULT_TRACER_NAME);

  const parentContext = context.active();
  const activeSpan = trace.getActiveSpan();

  const span = tracer.startSpan(
    name,
    { kind: activeSpan ? SpanKind.INTERNAL : SpanKind.SERVER, ...options },
    parentContext,
  );

  if (!span.isRecording()) {
    return Object.assign(trace.wrapSpanContext(INVALID_SPAN_CONTEXT), NOOP_SPAN);
  }

  const runWithContext = <T>(fn: () => Promise<T> | T) =>
    context.with(trace.setSpan(parentContext, span), fn);

  const recordError = (error: unknown) => {
    const err = toError(error);
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
  // FUTURE: Disable by namespace
  trace.getActiveSpan()?.addEvent(name, attributes);
};

export const setSpanAttributes = (attributes?: Attributes) => {
  if (!attributes) return;
  trace.getActiveSpan()?.setAttributes(attributes);
};

export const recordSpanError = (error: unknown) => {
  const span = trace.getActiveSpan();
  if (!span) return;

  const err = toError(error);
  span.recordException(err);
  span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
};
