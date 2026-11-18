import { groq } from "@ai-sdk/groq";
import { defineModelCatalog, gateway } from "@hebo-ai/gateway";
import { gptOss } from "@hebo-ai/gateway/models/openai";
import { withCanonicalIdsForGroq } from "@hebo-ai/gateway/providers/groq";
import { createFileRoute } from "@tanstack/react-router";

const gw = gateway({
  basePath: "/api/gateway",
  providers: {
    groq: withCanonicalIdsForGroq(groq),
  },
  models: defineModelCatalog(gptOss["all"]),
});

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: ({ request }) => gw.handler(request),
      POST: ({ request }) => gw.handler(request),
    },
  },
});
