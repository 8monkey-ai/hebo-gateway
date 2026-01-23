import type { GatewayConfig, Endpoint } from "#/types";

import { createErrorResponse } from "../../utils/errors";
import { toOpenAICompatibleModelList } from "./converters";

export const models = (config: GatewayConfig): Endpoint => {
  const models = config.models ?? {};

  const handler = (req: Request) => {
    if (req.method !== "GET") {
      return Promise.resolve(createErrorResponse("METHOD_NOT_ALLOWED", "Method Not Allowed", 405));
    }
    const openAICompatibleList = toOpenAICompatibleModelList(models);

    return Promise.resolve(
      new Response(JSON.stringify(openAICompatibleList), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  };

  return { handler: handler as typeof fetch };
};
