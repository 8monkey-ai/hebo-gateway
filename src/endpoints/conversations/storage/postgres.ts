import type { SQL } from "bun";
import type { Pool } from "pg";
import type { Sql } from "postgres";

import type { DialectConfig } from "./sql/types";

import { createSqlStorage } from "./sql/factory";

export type PostgresJsSql = Sql;
export type PgPool = Pool;

export const PostgresDialect: DialectConfig = {
  placeholder: (i) => `$${i + 1}`,
  idType: "VARCHAR(255)",
  objectType: "VARCHAR(64)",
  jsonType: "JSONB",
  createdAtType: "BIGINT",
  sequentialIndexUsing: "BRIN",
};

export function createPgStorage(pool: Pool, dialect: DialectConfig = PostgresDialect) {
  return createSqlStorage(
    {
      async all<T>(sql: string, params?: unknown[]) {
        const res = await pool.query(sql, params);
        return res.rows as T[];
      },
      async get<T>(sql: string, params?: unknown[]) {
        const res = await pool.query(sql, params);
        return res.rows[0] as T | undefined;
      },
      async run(sql: string, params?: unknown[]) {
        const res = await pool.query(sql, params);
        return { changes: Number(res.rowCount ?? 0) };
      },
    },
    dialect,
  );
}

export function createPostgresJsStorage(sql: Sql, dialect: DialectConfig = PostgresDialect) {
  return createSqlStorage(
    {
      async all<T>(query: string, params?: unknown[]) {
        return (await sql.unsafe(query, (params ?? []) as Parameters<Sql["unsafe"]>[1])) as T[];
      },
      async get<T>(query: string, params?: unknown[]) {
        const rows = await sql.unsafe(query, (params ?? []) as Parameters<Sql["unsafe"]>[1]);
        return rows[0] as T | undefined;
      },
      async run(query: string, params?: unknown[]) {
        const res = await sql.unsafe(query, (params ?? []) as Parameters<Sql["unsafe"]>[1]);
        const result = res as unknown as { count: number };
        return { changes: Number(result.count ?? 0) };
      },
    },
    dialect,
  );
}

export function createBunPostgresStorage(sql: SQL, dialect: DialectConfig = PostgresDialect) {
  return createSqlStorage(
    {
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
    dialect,
  );
}
