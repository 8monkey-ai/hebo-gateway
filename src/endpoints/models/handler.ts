import type { ModelCatalog } from "../../models/types";
import type { Endpoint } from "./types";

import { createErrorResponse } from "../../utils/errors";
import { toOpenAICompatibleModelList } from "./converters";

export const models = (models: ModelCatalog): Endpoint => ({
  handler: ((req: Request) => {
    if (req.method !== "GET") {
      return Promise.resolve(createErrorResponse("METHOD_NOT_ALLOWED", "Method Not Allowed", 405));
    }
    const openAICompatibleList = toOpenAICompatibleModelList(models);

    return Promise.resolve(
      new Response(JSON.stringify(openAICompatibleList), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  }) as typeof fetch,
});
