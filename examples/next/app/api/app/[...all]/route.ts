import { groq } from "@ai-sdk/groq";
import { gateway } from "@hebo-ai/gateway";
import { withCanonicalIdsForGroq } from "@hebo-ai/gateway/providers/groq";

const gw = gateway({
  basePath: "/api/app/gateway",
  providers: {
    groq: withCanonicalIdsForGroq(groq),
  },
  models: { include: ["openai/gpt-oss-*"] },
});

export const GET = gw.handler,
  POST = gw.handler;
