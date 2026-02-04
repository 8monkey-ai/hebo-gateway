import { groq } from "@ai-sdk/groq";
import { defineModelCatalog, gateway } from "@hebo-ai/gateway";
import { gptOss } from "@hebo-ai/gateway/models/openai";
import { withCanonicalIdsForGroq } from "@hebo-ai/gateway/providers/groq";

const gw = gateway({
  basePath: "/api/app/gateway",
  providers: {
    groq: withCanonicalIdsForGroq(groq),
  },
  models: defineModelCatalog(gptOss["all"]),
});

export const GET = gw.handler,
  POST = gw.handler;
