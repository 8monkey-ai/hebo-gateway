import type { ModelCatalog } from "../types";
import type { Endpoint } from "./types";

import { toOpenAICompatibleModelList } from "../oai-compat/converters";

export const models = (models: ModelCatalog): Endpoint => ({
  handler: (req: Request) => {
    if (req.method !== "GET") {
      return Promise.resolve(new Response("Method Not Allowed", { status: 405 }));
    }
    const openAICompatibleList = toOpenAICompatibleModelList(models);

    return Promise.resolve(
      new Response(JSON.stringify(openAICompatibleList), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  },
});
