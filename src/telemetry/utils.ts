import { resolveRequestId } from "#/utils/headers";

import type { GatewayContext } from "../types";

const getHeader = (headers: Headers, name: string) => headers.get(name) ?? undefined;

const getPath = (request: Request) => {
  try {
    // FUTURE: optimize
    return new URL(request.url).pathname;
  } catch {
    return request.url;
  }
};

const toGenAIOperationName = (operation?: GatewayContext["operation"]) =>
  operation === "embeddings" ? "embeddings" : operation === "text" ? "chat" : undefined;

// FUTURE: check with Elysia
export const getRequestAttributes = (request?: Request) => {
  if (!request) return {};

  return {
    "request.id": resolveRequestId(request),
    "http.request.method": request.method,
    "url.path": getPath(request),
    "http.request.header.content_type": getHeader(request.headers, "content-type"),
    "http.request.header.content_length": getHeader(request.headers, "content-length"),
    "user_agent.original": getHeader(request.headers, "user-agent"),
  };
};

// FUTURE: check with Gen AI
export const getAIAttributes = (context?: Partial<GatewayContext>) => {
  if (!context) return {};

  return {
    "gen_ai.operation.name": toGenAIOperationName(context.operation),
    "gen_ai.request.model": context.modelId,
    "gen_ai.response.model": context.resolvedModelId,
    "gen_ai.provider.name": context.resolvedProviderId,
  };
};

// FUTURE: check with Elysia
export const getResponseAttributes = (result?: Response) => {
  if (!result) return {};

  return {
    "http.response.status_code": result.status,
    "http.response.header.content_type": getHeader(result.headers, "content-type"),
    "http.response.header.content_length": getHeader(result.headers, "content-length"),
  };
};
