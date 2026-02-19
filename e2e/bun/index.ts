import { createVertex } from "@ai-sdk/google-vertex";
import { createGroq } from "@ai-sdk/groq";
import { defineModelCatalog, gateway } from "@hebo-ai/gateway";
import { gemini } from "@hebo-ai/gateway/models/google";
import { gptOss } from "@hebo-ai/gateway/models/openai";
import { withCanonicalIdsForGroq } from "@hebo-ai/gateway/providers/groq";
import { withCanonicalIdsForVertex } from "@hebo-ai/gateway/providers/vertex";

const gw = gateway({
  basePath: "/v1/gateway",
  providers: {
    groq: withCanonicalIdsForGroq(createGroq()),
    vertex: withCanonicalIdsForVertex(createVertex()),
  },
  models: defineModelCatalog(gptOss["all"], gemini["all"]),
});

const server = Bun.serve({
  port: 3000,
  fetch: (request) => gw.handler(request),
});

console.log(`🐒 Hebo Gateway is running with Bun on ${server?.url}`);
