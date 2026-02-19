import { createGroq } from "@ai-sdk/groq";
import { defineModelCatalog, gateway } from "@hebo-ai/gateway";
import { gptOss } from "@hebo-ai/gateway/models/openai";
import { withCanonicalIdsForGroq } from "@hebo-ai/gateway/providers/groq";

const gw = gateway({
  basePath: "/v1/gateway",
  providers: {
    groq: withCanonicalIdsForGroq(createGroq()),
  },
  models: defineModelCatalog(gptOss["all"]),
});

const server = Bun.serve({
  port: 3000,
  fetch: (request) => gw.handler(request),
});

console.log(`🐒 Hebo Gateway is running with Bun on ${server?.url}`);
