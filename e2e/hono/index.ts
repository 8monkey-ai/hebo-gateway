import { groq } from "@ai-sdk/groq";
import { defineModelCatalog, gateway } from "@hebo-ai/gateway";
import { gptOss } from "@hebo-ai/gateway/models/openai";
import { withCanonicalIdsForGroq } from "@hebo-ai/gateway/providers/groq";
import { Hono } from "hono";

const gw = gateway({
  providers: {
    groq: withCanonicalIdsForGroq(groq),
  },
  models: defineModelCatalog(gptOss["all"]),
});

export default new Hono().mount("/v1/gateway/", gw.handler);

console.log(`🐒 Hebo Gateway is running with Hono framework`);
