import type { GatewayHooks, RequestPatch } from "../types";

const applyRequestPatch = (request: Request, patch: RequestPatch) => {
  if (!patch.headers && patch.body === undefined) return request;

  const headers = new Headers(request.headers);
  if (patch.headers) {
    for (const [key, value] of new Headers(patch.headers)) {
      headers.set(key, value);
    }
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
    const patch = await hooks?.before?.({ request });

    const nextRequest =
      patch && ("headers" in patch || "body" in patch)
        ? applyRequestPatch(request, patch)
        : request;

    const response = await run(nextRequest);

    const afterResponse = await hooks?.after?.({ response });

    return afterResponse ?? response;
  };
  return handler;
};
