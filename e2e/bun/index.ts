import { createVertex } from "@ai-sdk/google-vertex";
import { defineModelCatalog, gateway } from "@hebo-ai/gateway";
import { gemini } from "@hebo-ai/gateway/models/google";
import { withCanonicalIdsForVertex } from "@hebo-ai/gateway/providers/vertex";

const gw = gateway({
  basePath: "/v1/gateway",
  providers: {
    vertex: withCanonicalIdsForVertex(createVertex()),
  },
  models: defineModelCatalog(gemini["all"]),
});

const server = Bun.serve({
  port: 3000,
  fetch: (request) => gw.handler(request),
});

console.log(`🐒 Hebo Gateway is running with Bun on ${server?.url}`);
