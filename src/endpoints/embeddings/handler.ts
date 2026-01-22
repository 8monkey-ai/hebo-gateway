import type { ProviderRegistryProvider } from "ai";

import { embedMany } from "ai";

import type { ModelCatalog } from "../../models/types";
import type { Endpoint } from "./types";

import { toOpenAICompatibleEmbeddingResponseBody } from "./converters";
import {
  OpenAICompatibleEmbeddingRequestBodySchema,
  type OpenAICompatibleEmbeddingResponseBody,
} from "./schema";

export const embeddings = (
  providers?: ProviderRegistryProvider,
  models: ModelCatalog = {},
): Endpoint => ({
  handler: (async (req: Request): Promise<Response> => {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    let json;
    try {
      json = await req.json();
    } catch {
      return new Response("Bad Request: Invalid JSON", { status: 400 });
    }

    const result = OpenAICompatibleEmbeddingRequestBodySchema.safeParse(json);

    if (!result.success) {
      return new Response(
        `Bad Request: ${result.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join(", ")}`,
        { status: 400 },
      );
    }

    const requestBody = result.data;
    const { input, model, ...rest } = requestBody;

    const catalogModel = models[model];
    const resolvedProvider = catalogModel.providers[0];

    const embeddingModelId = `${resolvedProvider}:${model}`;

    let embeddingModel;
    try {
      embeddingModel = providers.embeddingModel(embeddingModelId as `${string}:${string}`);
    } catch {
      return new Response(
        `Bad Request: Model '${model}' not found or not supported for embeddings`,
        {
          status: 400,
        },
      );
    }

    const providerOptions = {
      [resolvedProvider]: rest,
    };

    let embedManyResult;
    try {
      const inputs = Array.isArray(input) ? input : [input];
      embedManyResult = await embedMany({
        model: embeddingModel,
        values: inputs,
        providerOptions,
      });
    } catch (error: any) {
      const errorMessage = error.message || "Failed to generate embeddings";
      return new Response(`Internal Server Error: ${errorMessage}`, {
        status: 500,
      });
    }

    const openAICompatibleResponse: OpenAICompatibleEmbeddingResponseBody =
      toOpenAICompatibleEmbeddingResponseBody(embedManyResult, model);

    const finalResponse = new Response(JSON.stringify(openAICompatibleResponse), {
      headers: { "Content-Type": "application/json" },
    });

    return finalResponse;
  }) as typeof fetch,
});
