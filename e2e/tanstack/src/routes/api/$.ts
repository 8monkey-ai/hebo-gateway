import { createFileRoute } from "@tanstack/react-router";

import { createModelCatalog, gateway } from "../../gateway/";
import { gptOss } from "../../gateway/models/presets/gpt-oss";

const gw = gateway({
  basePath: "/api/gateway",
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
