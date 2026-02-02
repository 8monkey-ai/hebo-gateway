import type { GatewayConfig, GatewayContext, RequestPatch } from "./types";

import { parseConfig } from "./config";
import { createErrorResponse } from "./utils/errors";

const maybeApplyRequestPatch = (request: Request, patch: RequestPatch) => {
  if (!patch.headers && patch.body === undefined) return request;

  if (!patch.headers) {
    // eslint-disable-next-line no-invalid-fetch-options
    return new Request(request, { body: patch.body });
  }

  const headers = new Headers(request.headers);
  for (const [key, value] of new Headers(patch.headers)) {
    headers.set(key, value);
  }

  const init: RequestInit = { headers };
  if (patch.body !== undefined) init.body = patch.body;

  return new Request(request, init);
};

export const withLifecycle = (
  run: (ctx: GatewayContext) => Promise<Response>,
  config: GatewayConfig,
) => {
  const parsedConfig = parseConfig(config);

  const handler = async (request: Request, state?: Record<string, unknown>): Promise<Response> => {
    const context: GatewayContext = {
      request,
      state: state ?? {},
      providers: parsedConfig.providers,
      models: parsedConfig.models,
    };

    let beforeResult;
    try {
      beforeResult = await parsedConfig.hooks?.before?.(context);
    } catch (error) {
      return createErrorResponse("INTERNAL_SERVER_ERROR", error, 500);
    }
    if (beforeResult instanceof Response) return beforeResult;

    context.request = beforeResult ? maybeApplyRequestPatch(request, beforeResult) : request;

    context.response = await run(context);

    let after;
    try {
      after = await parsedConfig.hooks?.after?.(context);
    } catch (error) {
      return createErrorResponse("INTERNAL_SERVER_ERROR", error, 500);
    }
    return after ?? context.response;
  };

  return handler;
};
