/**
 * Generic utility to chain multiple functions together.
 */
function pipe<T>(...fns: ((v: T) => T)[]) {
  return (v: T): T => {
    for (const f of fns) {
      v = f(v);
    }
    return v;
  };
}

/**
 * Normalizes a list of parameters by applying a chain of atomic mappers to each value.
 */
export function createParamsMapper(...mappers: ((v: unknown) => unknown)[]) {
  const p = pipe(...mappers);
  return (params?: unknown[]) =>
    params?.map((v) => p(v)) as (string | number | bigint | boolean | null)[];
}

/**
 * Normalizes an object (row) by applying a chain of atomic mappers.
 * Mappers are expected to mutate the object for performance and to avoid spreads.
 */
export function createRowMapper<T>(
  ...mappers: ((row: Record<string, unknown>) => Record<string, unknown>)[]
) {
  return pipe(...mappers) as unknown as (row: Record<string, unknown>) => T;
}

/**
 * Atomic mappers for input parameters.
 */
export const dateToNumber = (v: unknown) => (v instanceof Date ? v.getTime() : v);
export const dateToBigInt = (v: unknown) => (v instanceof Date ? BigInt(v.getTime()) : v);
export const jsonStringify = (v: unknown) =>
  v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v;

/**
 * Atomic mappers for database rows.
 */
export const parseJson =
  (key: string) =>
  (row: Record<string, unknown>): Record<string, unknown> => {
    const val = row[key];
    if (typeof val === "string") {
      row[key] = val === "" || val === "{}" ? {} : JSON.parse(val);
    }
    return row;
  };

export const toMilliseconds =
  (key: string) =>
  (row: Record<string, unknown>): Record<string, unknown> => {
    const v = row[key];
    if (v instanceof Date) {
      row[key] = v.getTime();
    } else if (typeof v === "number" || typeof v === "bigint" || typeof v === "string") {
      row[key] = Number(v);
    }
    return row;
  };

export const mergeData =
  (key: string) =>
  (row: Record<string, unknown>): Record<string, unknown> => {
    const data = row[key];
    if (data !== null && typeof data === "object") {
      Object.assign(row, data);
      delete row[key];
    }
    return row;
  };
