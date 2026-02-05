import type {
  AfterHookContext,
  BeforeHookContext,
  GatewayConfig,
  GatewayContext,
  RequestPatch,
} from "./types";

import { parseConfig } from "./config";
import { createOpenAIErrorResponse } from "./utils/errors";
import { getRequestMeta, getResponseMeta, logger } from "./utils/logger";
import { toResponse } from "./utils/response";

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
  run: (ctx: GatewayContext) => Promise<ReadableStream | object | string>,
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

    let response, error;

    try {
      const before = await parsedConfig.hooks?.before?.(context as BeforeHookContext);
      if (before instanceof Response) return (response = before);
      context.request = before ? maybeApplyRequestPatch(request, before) : request;

      const result = await run(context);
      context.response = toResponse(result);

      const after = await parsedConfig.hooks?.after?.(context as AfterHookContext);
      return (response = after ?? context.response);
    } catch (e) {
      return (response = createOpenAIErrorResponse((error = e)));
    } finally {
      const req = getRequestMeta(request);
      const res = getResponseMeta(response, Date.now() - start);

      if (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error(err, { req, res }, "[gateway] request failed");
      } else {
        // FUTURE: if response is a stream, it needs to be wrapped for error logging
        logger.info({ req, res }, "[gateway] request completed");
      }
    }
  };

  return handler;
};
