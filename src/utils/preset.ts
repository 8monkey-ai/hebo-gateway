function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

export type DeepPartial<T> = T extends (...args: unknown[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? readonly DeepPartial<U>[]
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;

/**
 * Deep merge where overrides win.
 * Arrays are replaced.
 */
export function deepMerge<A extends object, B extends object>(base: A, override?: B): A & B {
  if (override === null || override === undefined) return base as A & B;

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

type RequiredKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? never : K }[keyof T];
type MissingRequiredKeys<T, Base> = Exclude<RequiredKeys<T>, keyof Base>;
type OverrideFor<T, Base> = DeepPartial<T> & Pick<T, MissingRequiredKeys<T, Base>>;

export function presetFor<Ids extends string, T extends Record<string, unknown>>() {
  return function preset<const Id extends Ids, const Base extends DeepPartial<T>>(
    id: Id,
    base: Base,
  ) {
    return <const O extends OverrideFor<T, Base>>(override: O) => {
      const merged = deepMerge(base, override);
      return { [id]: merged } as Record<Id, Base & O>;
    };
  };
}
