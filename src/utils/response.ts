export const mergeResponseInit = (
  baseInit?: ResponseInit,
  overrideInit?: ResponseInit,
): ResponseInit => {
  const headers = new Headers(baseInit?.headers);

  const overrideHeaders = overrideInit?.headers;
  if (overrideHeaders) {
    new Headers(overrideHeaders).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  const merged: ResponseInit = {};
  if (baseInit) Object.assign(merged, baseInit);
  if (overrideInit) Object.assign(merged, overrideInit);
  merged.headers = headers;

  return merged;
};

export const toResponse = (
  result: ReadableStream | object | string,
  responseInit?: ResponseInit,
): Response => {
  const isStream = result instanceof ReadableStream;
  let body: BodyInit;

  if (isStream) {
    body = result;
  } else {
    body = typeof result === "string" ? result : JSON.stringify(result);
  }

  const init = mergeResponseInit(
    {
      headers: isStream
        ? {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          }
        : { "Content-Type": "application/json" },
    },
    responseInit,
  );

  return new Response(body, init);
};
