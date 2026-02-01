export const mergeResponseInit = (
  defaultHeaders: HeadersInit,
  responseInit?: ResponseInit,
): ResponseInit => {
  const headers = new Headers(defaultHeaders);

  const override = responseInit?.headers;
  if (override) {
    new Headers(override).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  return responseInit ? { ...responseInit, headers } : { headers };
};
