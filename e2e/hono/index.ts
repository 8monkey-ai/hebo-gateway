import { groq } from "@ai-sdk/groq";
import { createProviderRegistry } from "ai";
import { Hono } from "hono";

import { createModelCatalog, gateway } from "#/";
import { gptOss } from "#/models/presets/gpt-oss";

const gw = gateway({
  providers: createProviderRegistry({
    groq,
  }),
  models: createModelCatalog(...gptOss["all"].map((model) => model({}))),
});

export default new Hono().mount("/v1/gateway/", gw.handler);

console.log(`🐒 Hebo Gateway is running with Hono framework`);
