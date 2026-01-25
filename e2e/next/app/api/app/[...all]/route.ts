import { createProviderRegistry } from "ai";

import { createModelCatalog, gateway, groqWithCanonicalIds } from "#/";
import { gptOss } from "#/models/presets/gpt-oss";

const gw = gateway({
  providers: createProviderRegistry({
    groq: groqWithCanonicalIds(),
  }),
  models: createModelCatalog(...gptOss["all"].map((model) => model({}))),
});

export const GET = gw.handler,
  POST = gw.handler;
