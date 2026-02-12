import type { Attributes, Span, SpanOptions, Tracer } from "@opentelemetry/api";

import { SpanStatusCode, context, trace } from "@opentelemetry/api";

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

export const startSpan = (
  name: string,
  spanOptions?: SpanOptions,
  tracer?: Tracer,
  rootOnly = false,
) => {
  const parentContext = context.active();
  const activeSpan = rootOnly ? trace.getActiveSpan() : undefined;

  const span =
    activeSpan ??
    (tracer ?? trace.getTracer(DEFAULT_TRACER_NAME)).startSpan(name, spanOptions, parentContext);

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
    if (!activeSpan) span.end();
  };

  return Object.assign(span, { runWithContext, recordError, finish });
};

export const withSpan = async <T>(name: string, run: () => Promise<T> | T): Promise<T> => {
  const started = startSpan(name);
  try {
    return await started.runWithContext(run);
  } catch (error) {
    started.recordError(error);
    throw error;
  } finally {
    started.finish();
  }
};
