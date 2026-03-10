/**
 * Helper to stringify object parameters.
 *
 * This is required because most database drivers (such as mysql2, postgres.js, and bun:sqlite)
 * do not automatically serialize JavaScript objects when inserting into JSON columns.
 * Without this, passing an object as a query parameter would often result in the
 * driver trying to bind it as a string "[object Object]" or failing with a type error.
 */
export const mapParams = (params?: unknown[]) =>
  params?.map((p) => (p !== null && typeof p === "object" ? JSON.stringify(p) : p)) as (
    | string
    | number
    | boolean
    | null
  )[];
