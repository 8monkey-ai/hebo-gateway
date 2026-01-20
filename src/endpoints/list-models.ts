import type { Endpoint, APIContext } from "../types";

import { toOpenAICompatibleModelList } from "../oai-compat/transformers";

export const listModelsEndpoint: Endpoint = {
  path: "/models",
  method: "GET",
  handler: (ctx: APIContext) => {
    const { config } = ctx;
    const models = config.models || {};

    const openAICompatibleList = toOpenAICompatibleModelList(models);

    return Promise.resolve(
      new Response(JSON.stringify(openAICompatibleList), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  },
};
