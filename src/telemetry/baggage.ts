const HEBO_BAGGAGE_PREFIX = "hebo.";

export const getBaggageAttributes = (request?: Request) => {
  const h = request?.headers.get("baggage");
  if (!h) return {};

  const attrs: Record<string, string> = {};

  for (const part of h.split(",")) {
    const [k, v] = part.trim().split("=", 2);
    if (!k || !v) continue;

    const [rawValue] = v.split(";", 1);
    if (!rawValue) continue;

    let value = rawValue;
    try {
      value = decodeURIComponent(rawValue);
    } catch {}

    if (k.startsWith(HEBO_BAGGAGE_PREFIX)) {
      attrs[k.slice(HEBO_BAGGAGE_PREFIX.length)] = value;
    }
  }

  return attrs;
};
