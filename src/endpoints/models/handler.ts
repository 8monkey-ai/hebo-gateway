import type { GatewayConfig, Endpoint } from "../../types";

import { parseConfig } from "../../config";
import { createErrorResponse } from "../../utils/errors";
import { toOpenAICompatibleModelListResponse } from "./converters";

export const models = (config: GatewayConfig, skipParse = false): Endpoint => {
  const { models } = skipParse ? config : parseConfig(config);

  // eslint-disable-next-line require-await
  const handler = async (req: Request): Promise<Response> => {
    if (req.method !== "GET") {
      return createErrorResponse("METHOD_NOT_ALLOWED", "Method Not Allowed", 405);
    }
    return toOpenAICompatibleModelListResponse(models);
  };

  return { handler: handler as typeof fetch };
};
