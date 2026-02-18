import { createGroq } from "@ai-sdk/groq";
import { defineModelCatalog, gateway } from "@hebo-ai/gateway";
import { gptOss } from "@hebo-ai/gateway/models/openai";
import { withCanonicalIdsForGroq } from "@hebo-ai/gateway/providers/groq";
import { Elysia } from "elysia";

const basePath = "/v1/gateway";

const gw = gateway({
  basePath,
  providers: {
    groq: withCanonicalIdsForGroq(createGroq()),
  },
  models: defineModelCatalog(gptOss["all"]),
});

const app = new Elysia()
  .all(`${basePath}/*`, ({ request }) => gw.handler(request), { parse: "none" })
  .listen(3100);

console.log(`🐒 Hebo Gateway is running with Elysia at ${app.server?.url}`);
