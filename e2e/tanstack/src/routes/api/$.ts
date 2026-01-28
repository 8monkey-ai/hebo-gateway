import { createFileRoute } from "@tanstack/react-router";

import { createModelCatalog, gateway } from "#/";
import { gptOss } from "#/models/presets/gpt-oss";
import { groqWithCanonicalIds } from "#/providers/canonical/groq";

const gw = gateway({
  basePath: "/api/pages/gateway",
  providers: {
    groq: groqWithCanonicalIds(),
  },
  models: createModelCatalog(...gptOss["all"].map((preset) => preset({}))),
});

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: ({ request }) => gw.handler(request),
      POST: ({ request }) => gw.handler(request),
    },
  },
});
