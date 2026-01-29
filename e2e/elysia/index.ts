import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { Elysia } from "elysia";
import { createVoyage } from "voyage-ai-provider";

import { defineModelCatalog, gateway, withCanonicalIds } from "#/";
import { gptOss } from "#/models/gpt-oss";
import { llama } from "#/models/llama";
import { voyage } from "#/models/voyage";
import { withCanonicalIdsForGroq } from "#/providers/groq";
import { withCanonicalIdsForVoyage } from "#/providers/voyage";

const gw = gateway({
  providers: {
    groq: withCanonicalIdsForGroq(createGroq()),
    voyage: withCanonicalIdsForVoyage(createVoyage()),
    openai: withCanonicalIds(createOpenAI({ apiKey: process.env["OPENAI_API_KEY"] }), {
      mapping: {
        "openai/gpt-4.1-mini": "gpt-4.1-mini",
        "openai/text-embedding-3-small": "text-embedding-3-small",
      },
    }),
  },
  models: defineModelCatalog(gptOss["all"], voyage["all"], llama["all"]),
});

const app = new Elysia().mount("/v1/gateway/", gw.handler).listen(3000);

console.log(`🐒 Hebo Gateway is running with Elysia at ${app.server?.url}`);
