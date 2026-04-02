import { context, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { BasicTracerProvider } from "@opentelemetry/sdk-trace-base";
import { MockProviderV3 } from "ai/test";
import { afterEach, describe, expect, test } from "bun:test";

import { models } from "./endpoints/models/handler";

describe("winterCgHandler", () => {
  afterEach(() => {
    context.disable();
    trace.disable();
  });

  test("runs onRequest and onResponse hooks with the active span context", async () => {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());

    const tracer = new BasicTracerProvider().getTracer("test");
    let onRequestTraceId: string | undefined;
    let onResponseTraceId: string | undefined;

    const endpoint = models({
      providers: {
        openai: new MockProviderV3(),
      },
      models: {
        "openai/gpt-oss-20b": {
          name: "GPT-OSS 20B",
          modalities: { input: ["text"], output: ["text"] },
          providers: ["openai"],
        },
      },
      telemetry: {
        enabled: true,
        tracer,
      },
      hooks: {
        onRequest: async () => {
          await Promise.resolve();
          onRequestTraceId = trace.getActiveSpan()?.spanContext().traceId;
        },
        onResponse: async () => {
          await Promise.resolve();
          onResponseTraceId = trace.getActiveSpan()?.spanContext().traceId;
        },
      },
    });

    const response = await endpoint.handler(
      new Request("http://localhost/models", { method: "GET" }),
    );

    expect(response.status).toBe(200);
    expect(onRequestTraceId).toBeDefined();
    expect(onResponseTraceId).toBeDefined();
    expect(onResponseTraceId).toBe(onRequestTraceId);
  });

  test("runs onError with the active span context without running onResponse", async () => {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());

    const tracer = new BasicTracerProvider().getTracer("test");
    let onErrorTraceId: string | undefined;
    let onResponseCalled = false;

    const endpoint = models({
      providers: {
        openai: new MockProviderV3(),
      },
      models: {
        "openai/gpt-oss-20b": {
          name: "GPT-OSS 20B",
          modalities: { input: ["text"], output: ["text"] },
          providers: ["openai"],
        },
      },
      telemetry: {
        enabled: true,
        tracer,
      },
      hooks: {
        onError: async (ctx) => {
          await Promise.resolve();
          onErrorTraceId = trace.getActiveSpan()?.spanContext().traceId;
          expect((ctx.error as Error).message).toBe("Method Not Allowed");
          return new Response("teapot", { status: 418 });
        },
        onResponse: () => {
          onResponseCalled = true;
        },
      },
    });

    const response = await endpoint.handler(
      new Request("http://localhost/models", { method: "POST" }),
    );

    expect(response.status).toBe(418);
    expect(await response.text()).toBe("teapot");
    expect(onErrorTraceId).toBeDefined();
    expect(onResponseCalled).toBe(false);
  });
});
