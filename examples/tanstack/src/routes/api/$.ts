import { groq } from "@ai-sdk/groq";
import { gateway } from "@hebo-ai/gateway";
import { withCanonicalIdsForGroq } from "@hebo-ai/gateway/providers/groq";
import { createFileRoute } from "@tanstack/react-router";

const gw = gateway({
  basePath: "/api/gateway",
  providers: {
    groq: withCanonicalIdsForGroq(groq),
  },
  models: { include: ["openai/gpt-oss-*"] },
});

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: ({ request }) => gw.handler(request),
      POST: ({ request }) => gw.handler(request),
    },
  },
});
