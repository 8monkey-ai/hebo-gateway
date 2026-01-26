import type { GatewayConfig, Endpoint } from "../../types";

import { parseConfig } from "../../config";
import { createErrorResponse } from "../../utils/errors";
import { toOpenAICompatibleModelList } from "./converters";

export const models = (config: GatewayConfig, skipParse = false): Endpoint => {
  const { models } = skipParse ? config : parseConfig(config);

  // eslint-disable-next-line require-await
  const handler = async (req: Request): Promise<Response> => {
    if (req.method !== "GET") {
      return createErrorResponse("METHOD_NOT_ALLOWED", "Method Not Allowed", 405);
    }
    const openAICompatibleList = toOpenAICompatibleModelList(models);

    return new Response(JSON.stringify(openAICompatibleList), {
      headers: { "Content-Type": "application/json" },
    });
  };

  return { handler: handler as typeof fetch };
};
