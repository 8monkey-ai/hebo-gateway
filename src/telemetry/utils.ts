import type { Attributes } from "@opentelemetry/api";

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
export const getRequestAttributes = (request?: Request): Attributes => {
  if (!request) return {};

  const attributes: Attributes = {};
  const headers = request.headers;
  attributes["http.request.method"] = request.method;
  attributes["url.path"] = getPath(request);
  attributes["http.request.header.content_type"] = getHeader(headers, "content-type");
  attributes["http.request.header.content_length"] = getHeader(headers, "content-length");
  attributes["user_agent.original"] = getHeader(headers, "user-agent");

  return attributes;
};

// FUTURE: check with Gen AI
export const getAIAttributes = (context?: Partial<GatewayContext>): Attributes => {
  if (!context) return {};

  const attributes: Attributes = {};
  attributes["gen_ai.operation.name"] = toGenAIOperationName(context.operation);
  attributes["gen_ai.request.model"] = context.modelId;
  attributes["gen_ai.response.model"] = context.resolvedModelId;
  attributes["gen_ai.provider.name"] = context.resolvedProviderId;
  return attributes;
};

// FUTURE: check with Elysia
export const getResponseAttributes = (result?: Response): Attributes => {
  if (!result) return {};

  const attributes: Attributes = {};
  const headers = result.headers;
  attributes["http.response.status_code"] = result.status;
  attributes["http.response.header.content_type"] = getHeader(headers, "content-type");
  attributes["http.response.header.content_length"] = getHeader(headers, "content-length");
  return attributes;
};
