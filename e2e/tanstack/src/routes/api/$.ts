import { groq } from "@ai-sdk/groq";
import { createFileRoute } from "@tanstack/react-router";

import { createModelCatalog, gateway } from "#/";
import { gptOss } from "#/models/gpt-oss";
import { withCanonicalIdsForGroq } from "#/providers/groq";

const gw = gateway({
  basePath: "/api/pages/gateway",
  providers: {
    groq: withCanonicalIdsForGroq(groq),
  },
  models: createModelCatalog(gptOss["all"]),
});

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: ({ request }) => gw.handler(request),
      POST: ({ request }) => gw.handler(request),
    },
  },
});
