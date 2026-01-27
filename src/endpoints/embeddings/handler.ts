import { embedMany } from "ai";
import * as z from "zod/mini";

import type { GatewayConfig, Endpoint } from "../../types";

import { parseConfig } from "../../config";
import { resolveProvider } from "../../providers/registry";
import { createErrorResponse } from "../../utils/errors";
import { withHooks } from "../../utils/hooks";
import { fromOpenAICompatEmbeddingParams, toOpenAICompatEmbeddingResponse } from "./converters";
import { OpenAICompatEmbeddingRequestBodySchema } from "./schema";

export const embeddings = (config: GatewayConfig): Endpoint => {
  const { providers, models, hooks } = parseConfig(config);

  const handler = async (req: Request): Promise<Response> => {
    if (req.method !== "POST") {
      return createErrorResponse("METHOD_NOT_ALLOWED", "Method Not Allowed", 405);
    }

    let json;
    try {
      json = await req.json();
    } catch {
      return createErrorResponse("BAD_REQUEST", "Invalid JSON", 400);
    }

    const parsed = OpenAICompatEmbeddingRequestBodySchema.safeParse(json);

    if (!parsed.success) {
      return createErrorResponse(
        "UNPROCESSABLE_ENTITY",
        "Validation error",
        422,
        z.prettifyError(parsed.error),
      );
    }

    const requestBody = parsed.data;
    const { model: modelId, ...params } = requestBody;

    let resolvedModelId;
    try {
      resolvedModelId = (await hooks?.resolveModelId?.({ modelId })) ?? modelId;
    } catch (error) {
      return createErrorResponse("BAD_REQUEST", error, 400);
    }

    let provider;
    try {
      const args = {
        providers,
        models,
        modelId: resolvedModelId,
        operation: "embeddings" as const,
      };
      const override = await hooks?.resolveProvider?.(args);
      provider = override ?? resolveProvider(args);
    } catch (error) {
      return createErrorResponse("BAD_REQUEST", error, 400);
    }

    const embeddingModel = provider.embeddingModel(resolvedModelId);

    let embeddingOptions;
    try {
      embeddingOptions = fromOpenAICompatEmbeddingParams(params);
    } catch (error) {
      return createErrorResponse("BAD_REQUEST", error, 400);
    }

    let embedManyResult;
    try {
      embedManyResult = await embedMany({
        model: embeddingModel,
        ...embeddingOptions,
      });
    } catch (error) {
      return createErrorResponse("INTERNAL_SERVER_ERROR", error, 500);
    }

    return toOpenAICompatEmbeddingResponse(embedManyResult, modelId);
  };

  return { handler: withHooks(hooks, handler) };
};
