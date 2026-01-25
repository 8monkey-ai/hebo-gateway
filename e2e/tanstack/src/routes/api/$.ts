import { groq } from "@ai-sdk/groq";
import { createFileRoute } from "@tanstack/react-router";
import { createProviderRegistry } from "ai";

import { createModelCatalog, gateway } from "../../gateway/";
import { gptOss } from "../../gateway/models/presets/gpt-oss";

const gw = gateway({
  basePath: "/api/gateway",
  providers: createProviderRegistry({
    groq,
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
