import type { RequestPatch } from "../types";

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
