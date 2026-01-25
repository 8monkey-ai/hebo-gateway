import { createProviderRegistry } from "ai";
import { Hono } from "hono";

import { createModelCatalog, gateway, groqWithCanonicalIds } from "#/";
import { gptOss } from "#/models/presets/gpt-oss";

const gw = gateway({
  providers: createProviderRegistry({
    groq: groqWithCanonicalIds(),
  }),
  models: createModelCatalog(...gptOss["all"].map((model) => model({}))),
});

export default new Hono().mount("/v1/gateway/", gw.handler);

console.log(`🐒 Hebo Gateway is running with Hono framework`);
