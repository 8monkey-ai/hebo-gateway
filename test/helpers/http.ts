export const parseResponse = async <T = unknown>(res: Response): Promise<T | undefined> => {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
};

export const postJson = (url: string, body: unknown) =>
  new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
