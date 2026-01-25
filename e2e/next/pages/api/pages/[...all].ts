import type { NextApiRequest, NextApiResponse } from "next";

import { groq } from "@ai-sdk/groq";
import { createRequest, sendResponse } from "@mjackson/node-fetch-server";
import { createProviderRegistry } from "ai";

import { createModelCatalog, gateway } from "#/";
import { gptOss } from "#/models/presets/gpt-oss";

const gw = gateway({
  basePath: "/api/pages/gateway",
  providers: createProviderRegistry({
    groq,
  }),
  models: createModelCatalog(...gptOss["all"].map((model) => model({}))),
});
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await sendResponse(res, await gw.handler(createRequest(req, res)));
}
