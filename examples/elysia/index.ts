import { createGroq } from "@ai-sdk/groq";
import { gateway } from "@hebo-ai/gateway";
import { withCanonicalIdsForGroq } from "@hebo-ai/gateway/providers/groq";
import { Elysia } from "elysia";

const gw = gateway({
  providers: {
    groq: withCanonicalIdsForGroq(createGroq()),
  },
  models: { include: ["openai/gpt-oss-*"] },
});

const app = new Elysia().mount("/v1/gateway/", gw.handler).listen(3100);

console.log(`🐒 Hebo Gateway is running with Elysia at ${app.server?.url}`);
