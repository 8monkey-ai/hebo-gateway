import type { NextApiRequest, NextApiResponse } from "next";

import { groq } from "@ai-sdk/groq";
import { createRequest, sendResponse } from "@mjackson/node-fetch-server";

import { createModelCatalog, gateway } from "#/";
import { gptOss } from "#/models/gpt-oss";
import { withCanonicalIdsForGroq } from "#/providers/groq";

const gw = gateway({
  basePath: "/api/pages/gateway",
  providers: {
    groq: withCanonicalIdsForGroq(groq),
  },
  models: createModelCatalog(...gptOss["all"].map((preset) => preset({}))),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await sendResponse(res, await gw.handler(createRequest(req, res)));
}
