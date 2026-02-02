import { createCohere } from "@ai-sdk/cohere";
import { createGroq } from "@ai-sdk/groq";
import { Elysia } from "elysia";
import { createVoyage } from "voyage-ai-provider";

import { defineModelCatalog, gateway, type HookContext } from "#/";
import { embed } from "#/models/cohere";
import { llama } from "#/models/meta";
import { gptOss } from "#/models/openai";
import { voyage } from "#/models/voyage";
import { withCanonicalIdsForCohere } from "#/providers/cohere";
import { withCanonicalIdsForGroq } from "#/providers/groq";
import { withCanonicalIdsForVoyage } from "#/providers/voyage";

const basePath = "/v1/gateway";

const gw = gateway({
  basePath,
  providers: {
    groq: withCanonicalIdsForGroq(createGroq()),
    voyage: withCanonicalIdsForVoyage(createVoyage()),
    cohere: withCanonicalIdsForCohere(createCohere()),
  },
  models: defineModelCatalog(gptOss["all"], voyage["all"], llama["all"], embed["all"]),
  hooks: {
    resolveProvider: async (ctx: HookContext) => {
      console.log(ctx.state.auth.userId);
    },
  },
});

const app = new Elysia()
  .derive(() => ({
    auth: {
      userId: "dummy",
    },
  }))
  .all(`${basePath}/*`, ({ request, auth }) => gw.handler(request, { auth }))
  .listen(3000);

console.log(`🐒 Hebo Gateway is running with Elysia at ${app.server?.url}`);
