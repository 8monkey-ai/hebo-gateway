import { Hono } from "hono";

import { createModelCatalog, gateway } from "#/";
import { gptOss } from "#/models/presets/gpt-oss";
import { groqWithCanonicalIds } from "#/providers/canonical/groq";

const gw = gateway({
  providers: {
    groq: groqWithCanonicalIds(),
  },
  models: createModelCatalog(...gptOss["all"].map((preset) => preset({}))),
});

export default new Hono().mount("/v1/gateway/", gw.handler);

console.log(`🐒 Hebo Gateway is running with Hono framework`);
