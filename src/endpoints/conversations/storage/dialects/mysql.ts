import type { SQL as BunSql } from "bun";
import type { Pool as Mysql2Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

import type { DialectConfig, SqlDialect } from "./types";

export type { Mysql2Pool };

export const MySQLDialect: DialectConfig = {
  placeholder: () => "?",
  types: {
    varchar: "VARCHAR",
    json: "JSON",
    timestamp: "BIGINT",
    index: "B-TREE",
  },
};

/**
 * Helper to stringify object parameters.
 * Required because mysql2 does not automatically serialize objects for JSON columns,
 * even though MySQL supports a native JSON type.
 */
const mapParams = (params?: unknown[]) =>
  params?.map((p) => (p !== null && typeof p === "object" ? JSON.stringify(p) : p)) as (
    | string
    | number
    | boolean
    | null
  )[];

export function createMysql2Dialect(
  pool: Mysql2Pool,
  config: DialectConfig = MySQLDialect,
): SqlDialect {
  return {
    executor: {
      async all<T>(sql: string, params?: unknown[]) {
        const [rows] = await pool.query(sql, mapParams(params));
        return rows as T[];
      },
      async get<T>(sql: string, params?: unknown[]) {
        const [rows] = await pool.query(sql, mapParams(params));
        return (rows as RowDataPacket[])[0] as T | undefined;
      },
      async run(sql: string, params?: unknown[]) {
        const [res] = await pool.query(sql, mapParams(params));
        const header = res as unknown as ResultSetHeader;
        return { changes: Number(header.affectedRows ?? 0) };
      },
    },
    config,
  };
}

export function createBunMysqlDialect(
  sql: BunSql,
  config: DialectConfig = MySQLDialect,
): SqlDialect {
  return {
    executor: {
      async all<T>(query: string, params?: unknown[]) {
        return (await sql.unsafe(query, params)) as T[];
      },
      async get<T>(query: string, params?: unknown[]) {
        const rows = await sql.unsafe(query, params);
        return rows[0] as T | undefined;
      },
      async run(query: string, params?: unknown[]) {
        const res = await sql.unsafe(query, params);
        const result = res as unknown as { affectedRows?: number; count?: number; length: number };
        return { changes: Number(result.affectedRows ?? result.count ?? result.length ?? 0) };
      },
    },
    config,
  };
}
