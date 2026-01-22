import { createFileRoute } from "@tanstack/react-router";

import { claudeSonnet45, createModelCatalog, gateway } from "../../gateway";

const gw = gateway({
  basePath: "/api/gateway",
  models: createModelCatalog({
    ...claudeSonnet45({
      providers: ["bedrock"],
    }),
  }),
});

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: ({ request }) => gw.handler(request),
      POST: ({ request }) => gw.handler(request),
    },
  },
});
