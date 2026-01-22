function isPlainObject(v: unknown): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly (infer U)[]
    ? readonly U[]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

/**
 * Deep merge where overrides win.
 * Arrays are replaced.
 */
function deepMerge<A extends object, B extends object>(base: A, patch?: B): A & B {
  if (patch == null) {
    return base as A & B;
  }

  // Start from a shallow clone of base (preserves base keys)
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) };

  // Merge keys from patch
  for (const key of Object.keys(patch as any)) {
    const pv = (patch as any)[key];
    if (pv === undefined) continue;

    const bv = (base as any)[key];

    if (Array.isArray(pv)) {
      // replace arrays
      out[key] = pv;
    } else if (isPlainObject(bv) && isPlainObject(pv)) {
      // deep merge plain objects
      out[key] = deepMerge(bv, pv);
    } else {
      // replace primitives / functions / dates / non-plain objects / mismatched types
      out[key] = pv;
    }
  }

  return out as A & B;
}

export function presetFor<T extends object, Ids extends string = string>() {
  return function preset<const Id extends Ids, const Base extends DeepPartial<T>>(
    id: Id,
    base: Base,
  ) {
    return function apply<const Override extends DeepPartial<T> = {}>(
      override?: Override,
    ): { [K in Id]: Base & Override } {
      const merged = deepMerge(base, override) as unknown as Base & Override;
      return { [id]: merged } as { [K in Id]: Base & Override };
    };
  };
}
