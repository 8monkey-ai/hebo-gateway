import type { GatewayConfig, Endpoint } from "#/types";

import { createErrorResponse } from "../../utils/errors";
import { toOpenAICompatibleModelList } from "./converters";

export const models = (config: GatewayConfig): Endpoint => {
  const { providers, models } = config;

  if (!models) {
    throw new Error("Gateway config error: no models configured (config.models is empty).");
  }

  if (!providers) {
    throw new Error("Gateway config error: no providers configured (config.providers is empty).");
  }

  const configuredModels = Object.fromEntries(
    Object.entries(models).map(([id, model]) => [
      id,
      model
        ? {
            ...model,
            providers: model.providers.filter((p) => Object.keys(providers).includes(p)),
          }
        : model,
    ]),
  );

  // eslint-disable-next-line require-await
  const handler = async (req: Request): Promise<Response> => {
    if (req.method !== "GET") {
      return createErrorResponse("METHOD_NOT_ALLOWED", "Method Not Allowed", 405);
    }
    const openAICompatibleList = toOpenAICompatibleModelList(configuredModels);

    return new Response(JSON.stringify(openAICompatibleList), {
      headers: { "Content-Type": "application/json" },
    });
  };

  return { handler: handler as typeof fetch };
};
