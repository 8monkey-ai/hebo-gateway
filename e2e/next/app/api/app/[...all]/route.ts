import { createProviderRegistry } from "ai";

import { createModelCatalog, gateway, groqWithCanonicalIds, gptOss } from "#/";

const gw = gateway({
  basePath: "/api/app/gateway",
  providers: createProviderRegistry({
    groq: groqWithCanonicalIds(),
  }),
  models: createModelCatalog(...gptOss["all"].map((model) => model({}))),
});

export const GET = gw.handler,
  POST = gw.handler;
