function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

export type DeepPartial<T> = T extends (...args: any[]) => any
  ? T
  : T extends readonly (infer U)[]
    ? ReadonlyArray<DeepPartial<U>>
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;

/**
 * Deep merge where overrides win.
 * Arrays are replaced.
 */
export function deepMerge<A extends object, B extends object>(base: A, override?: B): A & B {
  if (override === null) return base as A & B;

  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override as unknown as A & B;
  }

  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };

  for (const [key, ov] of Object.entries(override as Record<string, unknown>)) {
    if (ov === undefined) continue;

    const bv = out[key];

    if (Array.isArray(ov)) {
      out[key] = ov;
      continue;
    }

    if (isPlainObject(bv) && isPlainObject(ov)) {
      out[key] = deepMerge(bv as object, ov as object);
      continue;
    }

    out[key] = ov;
  }

  return out as unknown as A & B;
}

export function presetFor<Ids extends string, T extends Record<string, unknown>>() {
  return function preset<const Id extends Ids, const Base extends DeepPartial<T>>(
    id: Id,
    base: Base,
  ) {
    return function apply<O extends DeepPartial<T>>(override: O): { [K in Id]: Base & O } {
      const merged = deepMerge(base, override);
      return { [id]: merged } as { [K in Id]: Base & O };
    };
  };
}

export function presetGroup<T extends Record<string, unknown>>() {
  return function group<const Fns extends ReadonlyArray<(override: DeepPartial<T>) => object>>(
    ...fns: Fns
  ) {
    return function applyAll<const O extends DeepPartial<T>>(override: O) {
      return Object.assign({}, ...fns.map((fn) => fn(override))) as {
        [K in keyof ReturnType<Fns[number]>]: ReturnType<Fns[number]>[K];
      };
    };
  };
}
