type Mapper = (v: any) => any;

/**
 * Normalizes a list of parameters by applying a chain of atomic mappers to each value.
 */
export function createMapper(...mappers: Mapper[]) {
  return (params?: unknown[]) =>
    params?.map((p) => {
      let val = p;
      for (const mapper of mappers) {
        val = mapper(val);
      }
      return val;
    }) as (string | number | bigint | boolean | null)[];
}

/**
 * Converts Date objects to millisecond numbers.
 */
export const dateToNumber: Mapper = (v) => (v instanceof Date ? v.getTime() : v);

/**
 * Converts Date objects to BigInt milliseconds.
 */
export const dateToBigInt: Mapper = (v) => (v instanceof Date ? BigInt(v.getTime()) : v);

/**
 * Stringifies plain objects and arrays to JSON strings.
 * Skips Date objects.
 */
export const jsonStringify: Mapper = (v) =>
  v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v;
