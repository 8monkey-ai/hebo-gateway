import type { RequestPatch } from "../types";

import pkg from "../../package.json" with { type: "json" };
import { REQUEST_ID_HEADER } from "./headers";

const GATEWAY_VERSION = pkg.version;

export const prepareRequestHeaders = (request: Request) => {
  const existingRequestId = request.headers.get(REQUEST_ID_HEADER);
  if (existingRequestId) return;

  const requestId =
    "req_" + crypto.getRandomValues(new Uint32Array(2)).reduce((s, n) => s + n.toString(36), "");

  const headers = new Headers(request.headers);
  headers.set(REQUEST_ID_HEADER, requestId);

  return headers;
};

export const prepareForwardHeaders = (request: Request): Record<string, string> => {
  const userAgent = request.headers.get("user-agent");
  const appendedUserAgent = userAgent
    ? `${userAgent} @hebo-ai/gateway/${GATEWAY_VERSION}`
    : `@hebo-ai/gateway/${GATEWAY_VERSION}`;

  return {
    "user-agent": appendedUserAgent,
  };
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
