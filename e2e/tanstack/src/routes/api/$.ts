import { claudeSonnet45 } from "#/models/presets/claude45";
import { createFileRoute } from "@tanstack/react-router";

import { gateway } from "../../gateway";

const gw = gateway({
  basePath: "/api/gateway",
  models: {
    ...claudeSonnet45({
      providers: ["bedrock"],
    }),
  },
});

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: ({ request }) => gw.handler(request),
      POST: ({ request }) => gw.handler(request),
    },
  },
});
