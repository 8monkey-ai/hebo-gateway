import type { NextApiRequest, NextApiResponse } from "next";

import { gateway, createModelCatalog } from "#/";
import { claudeSonnet45 } from "#/model-catalog/presets/claude45";
import { createRequest, sendResponse } from "@mjackson/node-fetch-server";

const gw = gateway({
  basePath: "/api/pages/gateway",
  models: createModelCatalog({
    ...claudeSonnet45({
      providers: ["bedrock"],
    }),
  }),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await sendResponse(res, await gw.handler(createRequest(req, res)));
}
