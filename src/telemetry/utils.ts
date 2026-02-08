import type { GatewayContext } from "../types";

const getHeader = (headers: Headers, name: string) => headers.get(name) ?? undefined;

export const getRequestMeta = (request?: Request): Record<string, unknown> => {
  if (!request) return {};

  let path = request.url;
  try {
    const url = new URL(request.url);
    path = url.pathname;
  } catch {
    path = request.url;
  }

  const headers = request.headers;
  return {
    method: request.method,
    path,
    contentType: getHeader(headers, "content-type"),
    contentLength: getHeader(headers, "content-length"),
    userAgent: getHeader(headers, "user-agent"),
  };
};

export const getAIMeta = (context?: Partial<GatewayContext>): Record<string, unknown> => {
  if (!context) return {};

  return {
    modelId: context.modelId,
    resolvedModelId: context.resolvedModelId,
    resolvedProviderId: context.resolvedProviderId,
  };
};

export const getResponseMeta = (result?: Response): Record<string, unknown> => {
  if (!result) return {};

  const headers = result.headers;
  return {
    status: result.status,
    statusText: result.statusText,
    contentType: getHeader(headers, "content-type"),
    contentLength: getHeader(headers, "content-length"),
  };
};
