import { createGroq } from "@ai-sdk/groq";
import { defineModelCatalog, gateway } from "@hebo-ai/gateway";
import { gptOss } from "@hebo-ai/gateway/models/openai";
import { withCanonicalIdsForGroq } from "@hebo-ai/gateway/providers/groq";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { context } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { BasicTracerProvider } from "@opentelemetry/sdk-trace-base";
import { Elysia } from "elysia";
import { pino } from "pino";

context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());

const gw = gateway({
  providers: {
    groq: withCanonicalIdsForGroq(createGroq()),
  },
  models: defineModelCatalog(gptOss["all"]),
  logger: pino({ level: "trace" }),
  telemetry: {
    enabled: true,
    tracer: new BasicTracerProvider({
      spanProcessors: [new LangfuseSpanProcessor()],
    }).getTracer("hebo"),
  },
});

const app = new Elysia()
  .derive(() => ({
    auth: {
      userId: "dummy",
    },
  }))
  .mount("/v1/gateway/", gw.handler)
  .listen(3100);

console.log(`🐒 Hebo Gateway is running with Elysia at ${app.server?.url}`);
