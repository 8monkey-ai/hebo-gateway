import type { GatewayConfig, Endpoint } from "../../types";

import { parseConfig } from "../../config";
import { createErrorResponse } from "../../utils/errors";
import { toOpenAICompatibleModel, toOpenAICompatibleModelList } from "./converters";

export const models = (config: GatewayConfig, skipParse = false): Endpoint => {
  const { models } = skipParse ? config : parseConfig(config);

  // eslint-disable-next-line require-await
  const handler = async (req: Request): Promise<Response> => {
    if (req.method !== "GET") {
      return createErrorResponse("METHOD_NOT_ALLOWED", "Method Not Allowed", 405);
    }

    const rawId = req.url.split("/models/", 2)[1]?.split("?", 1)[0];

    if (!rawId) {
      return new Response(JSON.stringify(toOpenAICompatibleModelList(models)), {
        headers: { "Content-Type": "application/json" },
      });
    }

    let modelId = rawId;
    try {
      modelId = decodeURIComponent(rawId);
    } catch {
      return createErrorResponse("BAD_REQUEST", "Invalid model ID", 400);
    }

    const model = models[modelId];
    if (!model) {
      return createErrorResponse("NOT_FOUND", `Model '${modelId}' not found`, 404);
    }

    const openAICompatibleModel = toOpenAICompatibleModel(modelId, model);

    return new Response(JSON.stringify(openAICompatibleModel), {
      headers: { "Content-Type": "application/json" },
    });
  };

  return { handler: handler as typeof fetch };
};
