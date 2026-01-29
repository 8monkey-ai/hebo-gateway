import { groq } from "@ai-sdk/groq";

import { defineModelCatalog, gateway } from "#/";
import { gptOss } from "#/models/gpt-oss";
import { withCanonicalIdsForGroq } from "#/providers/groq";

const gw = gateway({
  basePath: "/api/app/gateway",
  providers: {
    groq: withCanonicalIdsForGroq(groq),
  },
  models: defineModelCatalog(gptOss["all"]),
});

export const GET = gw.handler,
  POST = gw.handler;
