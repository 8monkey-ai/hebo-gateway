import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createCohere } from "@ai-sdk/cohere";
import { createGroq } from "@ai-sdk/groq";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { defineModelCatalog, gateway, type HookContext } from "@hebo-ai/gateway";
import { nova } from "@hebo-ai/gateway/models/amazon";
import { claude } from "@hebo-ai/gateway/models/anthropic";
import { embed } from "@hebo-ai/gateway/models/cohere";
import { llama } from "@hebo-ai/gateway/models/meta";
import { gptOss } from "@hebo-ai/gateway/models/openai";
import { voyage } from "@hebo-ai/gateway/models/voyage";
import { withCanonicalIdsForBedrock } from "@hebo-ai/gateway/providers/bedrock";
import { withCanonicalIdsForCohere } from "@hebo-ai/gateway/providers/cohere";
import { withCanonicalIdsForGroq } from "@hebo-ai/gateway/providers/groq";
import { withCanonicalIdsForVoyage } from "@hebo-ai/gateway/providers/voyage";
import {
  BasicTracerProvider,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { Elysia } from "elysia";
import { pino } from "pino";
import { createVoyage } from "voyage-ai-provider";

const basePath = "/v1/gateway";

const gw = gateway({
  basePath,
  providers: {
    groq: withCanonicalIdsForGroq(createGroq()),
    voyage: withCanonicalIdsForVoyage(createVoyage()),
    cohere: withCanonicalIdsForCohere(createCohere()),
    bedrock: withCanonicalIdsForBedrock(
      createAmazonBedrock({
        region: "us-east-1",
        credentialProvider: fromNodeProviderChain(),
      }),
    ),
  },
  models: defineModelCatalog(
    gptOss["all"],
    voyage["all"],
    llama["all"],
    embed["all"],
    claude["all"],
    nova["all"],
  ),
  hooks: {
    resolveProvider: async (ctx: HookContext) => {
      //console.log(ctx.state.auth.userId);
    },
  },
  logger: null,
  //logger: pino({ level: "trace" }),
  telemetry: {
    enabled: true,
    tracer: new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(new ConsoleSpanExporter())],
    }).getTracer("hebo-gateway"),
  },
});

const app = new Elysia()
  .derive(() => ({
    auth: {
      userId: "dummy",
    },
  }))
  .all(`${basePath}/*`, (ctx) => gw.handler(ctx.request, { auth: ctx.auth }), { parse: "none" })
  .listen(3000);

//console.log(`🐒 Hebo Gateway is running with Elysia at ${app.server?.url}`);
