import { groq } from "@ai-sdk/groq";
import { gateway } from "@hebo-ai/gateway";
import { withCanonicalIdsForGroq } from "@hebo-ai/gateway/providers/groq";
import { createRequest, sendResponse } from "@mjackson/node-fetch-server";
import type { NextApiRequest, NextApiResponse } from "next";

const gw = gateway({
  basePath: "/api/pages/gateway",
  providers: {
    groq: withCanonicalIdsForGroq(groq),
  },
  models: { include: ["openai/gpt-oss-*"] },
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await sendResponse(res, await gw.handler(createRequest(req, res)));
}
