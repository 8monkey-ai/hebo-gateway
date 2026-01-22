import type { NextApiRequest, NextApiResponse } from "next";

import { gateway } from "#/";
import { gptOss } from "#/models/presets/gpt-oss";
import { createRequest, sendResponse } from "@mjackson/node-fetch-server";

const gw = gateway({
  basePath: "/api/pages/gateway",
  models: Object.assign(
    {},
    ...gptOss.map((model) =>
      model({
        providers: ["groq"],
      }),
    ),
  ),
});
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await sendResponse(res, await gw.handler(createRequest(req, res)));
}
