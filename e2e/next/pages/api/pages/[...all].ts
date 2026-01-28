import type { NextApiRequest, NextApiResponse } from "next";

import { createRequest, sendResponse } from "@mjackson/node-fetch-server";

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await sendResponse(res, await gw.handler(createRequest(req, res)));
}
