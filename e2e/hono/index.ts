import { groq } from "@ai-sdk/groq";
import { Hono } from "hono";

import { defineModelCatalog, gateway } from "#/";
import { gptOss } from "#/models/openai";
import { withCanonicalIdsForGroq } from "#/providers/groq";

const gw = gateway({
  providers: {
    groq: withCanonicalIdsForGroq(groq),
  },
  models: defineModelCatalog(gptOss["all"]),
});

export default new Hono().mount("/v1/gateway/", gw.handler);

console.log(`🐒 Hebo Gateway is running with Hono framework`);
