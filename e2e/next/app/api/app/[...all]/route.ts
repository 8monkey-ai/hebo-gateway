import { groq } from "@ai-sdk/groq";
import { createProviderRegistry } from "ai";

import { createModelCatalog, gateway } from "#/";
import { gptOss } from "#/models/presets/gpt-oss";

const gw = gateway({
  providers: createProviderRegistry({
    groq,
  }),
  models: createModelCatalog(...gptOss["all"].map((model) => model({}))),
});

export const GET = gw.handler,
  POST = gw.handler;
