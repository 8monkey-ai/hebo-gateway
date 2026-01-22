import type { ProviderRegistryProvider } from "ai";

import { embedMany } from "ai";

import type { OpenAICompatibleEmbeddingRequest, OpenAICompatibleEmbeddingResponse } from "./schema";
import type { Endpoint } from "./types";

import { toOpenAICompatibleEmbeddingResponse } from "./converters";

export const embeddings = (providers?: ProviderRegistryProvider): Endpoint => ({
  handler: (async (req: Request): Promise<Response> => {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    let requestBody: OpenAICompatibleEmbeddingRequest;
    try {
      requestBody = (await req.json()) as OpenAICompatibleEmbeddingRequest;
    } catch (error) {
      return new Response("Bad Request: Invalid JSON", { status: 400 });
    }

    const { input, model, ...rest } = requestBody;

    if (!input || !model) {
      return new Response("Bad Request: Missing 'input' or 'model'", {
        status: 400,
      });
    }

    if (!providers) {
      return new Response("Internal Server Error: Providers not configured", {
        status: 500,
      });
    }

    let embeddingModel;
    try {
      embeddingModel = providers.embeddingModel(model as `${string}:${string}`);
    } catch (error) {
      console.error("Error getting embedding model from providers:", error);
      return new Response(
        `Bad Request: Model '${model}' not found or not supported for embeddings`,
        {
          status: 400,
        },
      );
    }

    if (!embeddingModel) {
      return new Response(`Bad Request: Model '${model}' not found in providers`, {
        status: 400,
      });
    }

    const providerKey = (model.includes(":") ? model.split(":")[0] : model) || model;
    const providerOptions = {
      [providerKey]: rest,
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
      console.error("Error generating embeddings:", error);
      const errorMessage = error.message || "Failed to generate embeddings";
      return new Response(`Internal Server Error: ${errorMessage}`, {
        status: 500,
      });
    }

    const openAICompatibleResponse: OpenAICompatibleEmbeddingResponse =
      toOpenAICompatibleEmbeddingResponse(model, embedManyResult);

    const finalResponse = new Response(JSON.stringify(openAICompatibleResponse), {
      headers: { "Content-Type": "application/json" },
    });

    return finalResponse;
  }) as typeof fetch,
});
