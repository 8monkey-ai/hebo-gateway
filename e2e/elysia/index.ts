import { createProviderRegistry } from "ai";
import { Elysia } from "elysia";

import { createModelCatalog, gateway, groqWithCanonicalIds } from "#/";
import { gptOss } from "#/models/presets/gpt-oss";

const gw = gateway({
  providers: createProviderRegistry({
    groq: groqWithCanonicalIds(),
  }),
  models: createModelCatalog(...gptOss["all"].map((model) => model({}))),
});

const app = new Elysia().mount("/v1/gateway/", gw.handler).listen(3000);

console.log(`🐒 Hebo Gateway is running with Elysia at ${app.server?.url}`);
