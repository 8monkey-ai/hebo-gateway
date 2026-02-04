import type { GatewayConfig, Endpoint, GatewayContext } from "../../types";

import { withLifecycle } from "../../lifecycle";
import { GatewayError } from "../../utils/errors";
import { createModelsResponse, createModelResponse } from "./converters";

export const models = (config: GatewayConfig): Endpoint => {
  // eslint-disable-next-line require-await
  const handler = async (ctx: GatewayContext): Promise<Response> => {
    const request = ctx.request;

    if (!request || request.method !== "GET") {
      throw new GatewayError("Method Not Allowed", "METHOD_NOT_ALLOWED", 405);
    }

    const rawId = request.url.split("/models/", 2)[1]?.split("?", 1)[0];
    if (!rawId) {
      return createModelsResponse(ctx.models);
    }

    let modelId = rawId;
    try {
      modelId = decodeURIComponent(rawId);
    } catch {
      throw new GatewayError(`Invalid model ID: '${modelId}'`, "BAD_REQUEST", 400, "model");
    }

    const model = ctx.models[modelId];
    if (!model) {
      throw new GatewayError(`Model not found: '${modelId}'`, "NOT_FOUND", 404, modelId);
    }

    return createModelResponse(modelId, model);
  };

  return { handler: withLifecycle(handler, config) };
};
