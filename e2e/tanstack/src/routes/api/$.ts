import { createFileRoute } from "@tanstack/react-router";
import { createProviderRegistry } from "ai";

import { createModelCatalog, gateway, groqWithCanonicalIds, gptOss } from "../../gateway/";

const gw = gateway({
  basePath: "/api/gateway",
  providers: createProviderRegistry({
    groq: groqWithCanonicalIds(),
  }),
  models: createModelCatalog(...gptOss["all"].map((model) => model({}))),
});

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: ({ request }) => gw.handler(request),
      POST: ({ request }) => gw.handler(request),
    },
  },
});
