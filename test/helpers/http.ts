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

export const postGzipJson = async (url: string, body: unknown) => {
  const raw = new TextEncoder().encode(JSON.stringify(body));
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  void writer.write(raw);
  void writer.close();
  const compressed = await new Response(cs.readable).arrayBuffer();
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Encoding": "gzip",
    },
    body: compressed,
  });
};
