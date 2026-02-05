import type {
  AfterHookContext,
  BeforeHookContext,
  GatewayConfig,
  GatewayContext,
  RequestPatch,
} from "./types";

import { parseConfig } from "./config";
import { createErrorResponse } from "./utils/errors";
import { getRequestMeta, getResponseMeta, logger } from "./utils/logger";

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
    const start = Date.now();

    const context: GatewayContext = {
      request,
      state: state ?? {},
      providers: parsedConfig.providers,
      models: parsedConfig.models,
    };

    let response: Response;

    try {
      const before = await parsedConfig.hooks?.before?.(context as BeforeHookContext);
      if (before instanceof Response) return (response = before);
      context.request = before ? maybeApplyRequestPatch(request, before) : request;

      context.response = await run(context);

      const after = await parsedConfig.hooks?.after?.(context as AfterHookContext);
      response = after ?? context.response;
    } catch (error) {
      return createErrorResponse(error, request, Date.now() - start);
    }

    const requestMeta = getRequestMeta(request);
    const responseMeta = getResponseMeta(response, Date.now() - start);
    logger.info({ request: requestMeta, response: responseMeta }, "[gateway] request completed");

    return response;
  };

  return handler;
};
