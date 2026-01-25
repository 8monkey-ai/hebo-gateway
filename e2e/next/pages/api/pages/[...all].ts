import type { NextApiRequest, NextApiResponse } from "next";

import { createRequest, sendResponse } from "@mjackson/node-fetch-server";
import { createProviderRegistry } from "ai";

import { createModelCatalog, gateway, groqWithCanonicalIds, gptOss } from "#/";

const gw = gateway({
  basePath: "/api/pages/gateway",
  providers: createProviderRegistry({
    groq: groqWithCanonicalIds(),
  }),
  models: createModelCatalog(...gptOss["all"].map((model) => model({}))),
});
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await sendResponse(res, await gw.handler(createRequest(req, res)));
}
