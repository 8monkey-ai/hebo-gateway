import type { GatewayHooks, RequestPatch } from "../types";

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

export const withHooks = (
  hooks: GatewayHooks | undefined,
  run: (request: Request) => Promise<Response>,
) => {
  const handler = async (request: Request): Promise<Response> => {
    const beforeResult = await hooks?.before?.({ request });
    if (beforeResult instanceof Response) return beforeResult;

    const nextRequest = beforeResult ? maybeApplyRequestPatch(request, beforeResult) : request;

    const response = await run(nextRequest);

    const after = await hooks?.after?.({ response });
    return after ?? response;
  };
  return handler;
};
