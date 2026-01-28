import { createModelCatalog, gateway } from "#/";
import { gptOss } from "#/models/presets/gpt-oss";
import { groqWithCanonicalIds } from "#/providers/canonical/groq";

const gw = gateway({
  basePath: "/api/app/gateway",
  providers: {
    groq: groqWithCanonicalIds(),
  },
  models: createModelCatalog(...gptOss["all"].map((preset) => preset({}))),
});

export const GET = gw.handler,
  POST = gw.handler;
