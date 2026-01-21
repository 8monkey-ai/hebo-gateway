import type { NextApiRequest, NextApiResponse } from "next";

import { gateway, createModelCatalog } from "#/";
import { createRequest, sendResponse } from "@mjackson/node-fetch-server";

const gw = gateway({
  basePath: "/api/pages/gateway",
  models: createModelCatalog({
    "anthropic/claude-sonnet-4.5": {
      name: "Claude Sonnet 4.5",
      created: "2025-09-29",
      knowledge: "2025-07",
      modalities: {
        input: ["text", "image", "pdf", "audio", "video"],
        output: ["text"],
      },
      context: 200000,
      capabilities: ["attachments", "reasoning", "tool_call", "structured_output", "temperature"],
      providers: ["bedrock"],
    },
  }),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await sendResponse(res, await gw.handler(createRequest(req, res)));
}
