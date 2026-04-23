/**
 * Generic utility to chain multiple functions together.
 */
function pipe<T>(fns: ((v: T) => T)[]) {
  return (v: T): T => {
    let result = v;
    for (let i = 0; i < fns.length; i++) {
      const fn = fns[i];
      if (fn) {
        result = fn(result);
      }
    }
    return result;
  };
}

/**
 * Normalizes a list of parameters by applying a chain of atomic mappers to each value.
 */
export function createParamsMapper(mappers: ((v: unknown) => unknown)[]) {
  const p = pipe<unknown>(mappers);
  return (params?: unknown[]) =>
    params?.map((v) => p(v)) as (string | number | bigint | boolean | null)[];
}

/**
 * Normalizes an object (row) by applying a chain of atomic mappers.
 * Mappers are expected to mutate the object for performance and to avoid spreads.
 */
export function createRowMapper<T>(mappers: ((row: T) => T)[]) {
  const p = pipe<T>(mappers);
  return (row: T) => p(row);
}

/**
 * Atomic mappers for input parameters.
 */
export const dateToNumber = (v: unknown) => (v instanceof Date ? v.getTime() : v);
export const dateToBigInt = (v: unknown) => (v instanceof Date ? BigInt(v.getTime()) : v);
export const jsonStringify = (v: unknown, asBinary = false) =>
  v !== null && typeof v === "object" && !(v instanceof Date)
    ? asBinary
      ? new TextEncoder().encode(JSON.stringify(v))
      : JSON.stringify(v)
    : v;

/**
 * Escapes single quotes in a string for use in SQL literals.
 */
export const escapeSqlString = (str: string) => str.replaceAll("'", "''");

/**
 * WORKAROUND: GreptimeDB can return Rust-style Unicode escapes (\u{xxxx})
 * inside JSON strings, which is invalid JSON and causes crashes in JSON.parse.
 * This normalization converts those escapes back into literal characters before parsing.
 */
function normalizeJsonUnicodeEscapes(value: string): string {
  return value.replaceAll(/\\u\{([0-9a-fA-F]+)\}/g, (_, hex) => String.fromCodePoint(+`0x${hex}`));
}

/**
 * Atomic mappers for database rows.
 */
export const parseJson =
  (key: string) =>
  (row: Record<string, unknown>): Record<string, unknown> => {
    const val = row[key];
    if (typeof val === "string") {
      row[key] = val === "" || val === "{}" ? {} : JSON.parse(normalizeJsonUnicodeEscapes(val));
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
