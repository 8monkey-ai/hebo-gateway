import type { NextApiRequest, NextApiResponse } from "next";

import { gateway, createModelCatalog, claudeSonnet45 } from "#/";
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
