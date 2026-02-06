import type { RequestPatch } from "../types";

import pkg from "../../package.json" with { type: "json" };

const GATEWAY_VERSION = pkg.version;

export const prepareForwardHeaders = (request: Request): Record<string, string> => {
  const userAgent = request.headers.get("user-agent");
  const appendedUserAgent = userAgent
    ? `${userAgent} @hebo-ai/gateway/${GATEWAY_VERSION}`
    : `@hebo-ai/gateway/${GATEWAY_VERSION}`;

  return {
    "x-request-id": request.headers.get("x-request-id")!,
    "user-agent": appendedUserAgent,
  };
};

export const prepareRequestBody = async (request: Request) => {
  let requestBytes = 0;
  let body: ArrayBuffer | undefined;
  if (request.body) {
    body = await request.arrayBuffer();
    requestBytes = body.byteLength;
  }

  return { body, requestBytes };
};

export const prepareRequestHeaders = (request: Request) => {
  const existingRequestId = request.headers.get("x-request-id");
  if (existingRequestId) return;

  const requestId =
    request.headers.get("x-correlation-id") ??
    request.headers.get("x-trace-id") ??
    crypto.randomUUID();

  const headers = new Headers(request.headers);
  headers.set("x-request-id", requestId);

  return headers;
};

export const maybeApplyRequestPatch = (request: Request, patch: RequestPatch) => {
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
