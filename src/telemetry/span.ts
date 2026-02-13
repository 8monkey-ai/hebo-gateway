import type { Attributes, Span, SpanOptions, Tracer } from "@opentelemetry/api";

import { INVALID_SPAN_CONTEXT, SpanKind, SpanStatusCode, context, trace } from "@opentelemetry/api";

const DEFAULT_TRACER_NAME = "@hebo-ai/gateway";
const mem = () => process?.memoryUsage?.();

const toError = (error: unknown) => (error instanceof Error ? error : new Error(String(error)));

const maybeSetDynamicAttributes = (span: Span, getAttributes: () => Attributes) => {
  const attrs = getAttributes();
  if (Object.keys(attrs).length === 0) return;
  span.setAttributes(attrs);
};

const getMemoryAttributes = (): Attributes => {
  const memory = mem();
  if (!memory) return {};

  return {
    "process.memory.usage": memory.rss,
    "process.memory.heap.used": memory.heapUsed,
    "process.memory.heap.total": memory.heapTotal,
  };
};

const NOOP_SPAN = {
  runWithContext: <T>(fn: () => Promise<T> | T) => fn(),
  recordError: (_error: unknown) => {},
  finish: () => {},
  isExisting: true,
};

export const startSpan = (name: string, options?: SpanOptions, customTracer?: Tracer) => {
  const tracer = customTracer ?? trace.getTracer(DEFAULT_TRACER_NAME);

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

  maybeSetDynamicAttributes(span, getMemoryAttributes);

  const runWithContext = <T>(fn: () => Promise<T> | T) =>
    context.with(trace.setSpan(parentContext, span), fn);

  const recordError = (error: unknown) => {
    const err = toError(error);
    span.recordException(err);
    span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
  };

  const finish = () => {
    maybeSetDynamicAttributes(span, getMemoryAttributes);
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
