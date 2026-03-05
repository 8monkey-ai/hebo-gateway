import type { SQL as BunSql } from "bun";
import type { Pool as PgPool } from "pg";
import type { Sql as PostgresJsSql } from "postgres";

import type { DialectConfig } from "./sql/types";

import { createSqlStorage } from "./sql/factory";

export type { PostgresJsSql, PgPool };

export const PostgresDialect: DialectConfig = {
  placeholder: (i) => `$${i + 1}`,
  types: {
    varchar: "VARCHAR",
    json: "JSONB",
    int64: "BIGINT",
    index: "BRIN",
  },
};

export function createPgStorage(pool: PgPool, dialect: DialectConfig = PostgresDialect) {
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

export function createPostgresJsStorage(
  sql: PostgresJsSql,
  dialect: DialectConfig = PostgresDialect,
) {
  return createSqlStorage(
    {
      async all<T>(query: string, params?: unknown[]) {
        return (await sql.unsafe(
          query,
          (params ?? []) as Parameters<PostgresJsSql["unsafe"]>[1],
        )) as T[];
      },
      async get<T>(query: string, params?: unknown[]) {
        const rows = await sql.unsafe(
          query,
          (params ?? []) as Parameters<PostgresJsSql["unsafe"]>[1],
        );
        return rows[0] as T | undefined;
      },
      async run(query: string, params?: unknown[]) {
        const res = await sql.unsafe(
          query,
          (params ?? []) as Parameters<PostgresJsSql["unsafe"]>[1],
        );
        const result = res as unknown as { count: number };
        return { changes: Number(result.count ?? 0) };
      },
    },
    dialect,
  );
}

export function createBunPostgresStorage(sql: BunSql, dialect: DialectConfig = PostgresDialect) {
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
