import { groq } from "@ai-sdk/groq";
import { gateway } from "@hebo-ai/gateway";
import { withCanonicalIdsForGroq } from "@hebo-ai/gateway/providers/groq";
import { Hono } from "hono";

const gw = gateway({
  providers: {
    groq: withCanonicalIdsForGroq(groq),
  },
  models: { include: ["openai/gpt-oss-*"] },
});

export default new Hono().mount("/v1/gateway/", gw.handler);

console.log(`🐒 Hebo Gateway is running with Hono framework`);
