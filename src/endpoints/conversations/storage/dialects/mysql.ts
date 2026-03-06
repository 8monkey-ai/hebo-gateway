import type { SQL as BunSql } from "bun";
import type { Pool as Mysql2Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

import type { DialectConfig, QueryExecutor, SqlDialect } from "./types";

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
  const executor: QueryExecutor = {
    async all<T>(sql: string, params?: unknown[]) {
      const [rows] = await pool.execute(sql, mapParams(params));
      return rows as T[];
    },
    async get<T>(sql: string, params?: unknown[]) {
      const [rows] = await pool.execute(sql, mapParams(params));
      return (rows as RowDataPacket[])[0] as T | undefined;
    },
    async run(sql: string, params?: unknown[]) {
      const [res] = await pool.execute(sql, mapParams(params));
      const header = res as unknown as ResultSetHeader;
      return { changes: Number(header.affectedRows ?? 0) };
    },
    async transaction<T>(fn: (executor: QueryExecutor) => Promise<T>) {
      const conn = await pool.getConnection();
      await conn.beginTransaction();
      try {
        const result = await fn({
          async all<R>(sql: string, params?: unknown[]) {
            const [rows] = await conn.execute(sql, mapParams(params));
            return rows as R[];
          },
          async get<R>(sql: string, params?: unknown[]) {
            const [rows] = await conn.execute(sql, mapParams(params));
            return (rows as RowDataPacket[])[0] as R | undefined;
          },
          async run(sql: string, params?: unknown[]) {
            const [res] = await conn.execute(sql, mapParams(params));
            const header = res as unknown as ResultSetHeader;
            return { changes: Number(header.affectedRows ?? 0) };
          },
          transaction: (f: (executor: QueryExecutor) => Promise<unknown>) => f(executor),
        } as QueryExecutor);
        await conn.commit();
        return result;
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    },
  };

  return {
    executor,
    config,
  };
}

export function createBunMysqlDialect(
  sql: BunSql,
  config: DialectConfig = MySQLDialect,
): SqlDialect {
  const executor: QueryExecutor = {
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
    async transaction<T>(fn: (executor: QueryExecutor) => Promise<T>) {
      return await sql.transaction(() => fn(executor));
    },
  };

  return {
    executor,
    config,
  };
}
