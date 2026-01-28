import { groq } from "@ai-sdk/groq";
import { Hono } from "hono";

import { createModelCatalog, gateway } from "#/";
import { gptOss } from "#/models/gpt-oss";
import { withCanonicalIdsForGroq } from "#/providers/groq";

const gw = gateway({
  providers: {
    groq: withCanonicalIdsForGroq(groq),
  },
  models: createModelCatalog(...gptOss["all"].map((preset) => preset({}))),
});

export default new Hono().mount("/v1/gateway/", gw.handler);

console.log(`🐒 Hebo Gateway is running with Hono framework`);
