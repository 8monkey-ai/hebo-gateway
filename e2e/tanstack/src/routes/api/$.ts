import { gptOss } from "#/models/presets/gpt-oss";
import { createFileRoute } from "@tanstack/react-router";

import { gateway } from "../../gateway";

const gw = gateway({
  basePath: "/api/gateway",
  models: Object.assign(
    {},
    ...gptOss.map((model) =>
      model({
        providers: ["groq"],
      }),
    ),
  ),
});

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: ({ request }) => gw.handler(request),
      POST: ({ request }) => gw.handler(request),
    },
  },
});
