import { createGroq } from "@ai-sdk/groq";
import { defineModelCatalog, gateway } from "@hebo-ai/gateway";
import { gptOss } from "@hebo-ai/gateway/models/openai";
import { withCanonicalIdsForGroq } from "@hebo-ai/gateway/providers/groq";
import { Elysia } from "elysia";

const gw = gateway({
  providers: {
    groq: withCanonicalIdsForGroq(createGroq()),
  },
  models: defineModelCatalog(gptOss["all"]),
});

const app = new Elysia().mount("/v1/gateway/", gw.handler).listen(3100);

console.log(`🐒 Hebo Gateway is running with Elysia at ${app.server?.url}`);
