import type { SQL } from "bun";
import type { Pool, PoolClient } from "pg";
import type { Sql, TransactionSql } from "postgres";

import type { DialectConfig, QueryExecutor } from "./sql/types";

import { createSqlStorage } from "./sql/factory";

export type PostgresJsSql = Sql;
export type PgPool = Pool;

export const PostgresDialect: DialectConfig = {
  placeholder: (i) => `$${i + 1}`,
  idType: "VARCHAR(255)",
  objectType: "VARCHAR(64)",
  jsonType: "JSONB",
  createdAtType: "BIGINT",
  createIndexSql: (table, name, columns) => {
    if (columns.some((c) => c.includes("created_at") && !c.includes("conversation_id"))) {
      return `CREATE INDEX IF NOT EXISTS ${name} ON ${table} USING BRIN (${columns.join(", ")})`;
    }
    return `CREATE INDEX IF NOT EXISTS ${name} ON ${table} (${columns.join(", ")})`;
  },
};

export function wrapPg(target: Pool | PoolClient) {
  return {
    async all<T>(sql: string, params?: unknown[]) {
      const res = await target.query(sql, params);
      return res.rows as T[];
    },
    async get<T>(sql: string, params?: unknown[]) {
      const res = await target.query(sql, params);
      return res.rows[0] as T | undefined;
    },
    async run(sql: string, params?: unknown[]) {
      const res = await target.query(sql, params);
      return { changes: Number(res.rowCount ?? 0) };
    },
  };
}

export function createPgStorage(pool: Pool, dialect: DialectConfig = PostgresDialect) {
  const executor: QueryExecutor = {
    ...wrapPg(pool),
    async transaction<T>(cb: (ex: QueryExecutor) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const txExecutor: QueryExecutor = {
          ...wrapPg(client),
          transaction<U>(innerCb: (ex: QueryExecutor) => Promise<U>) {
            return innerCb(txExecutor);
          },
        };
        const res = await cb(txExecutor);
        await client.query("COMMIT");
        return res;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
  };

  return createSqlStorage(executor, dialect);
}

export function wrapPostgresJs(target: Sql | TransactionSql) {
  return {
    async all<T>(query: string, params?: unknown[]) {
      return (await target.unsafe(query, params as any[])) as T[];
    },
    async get<T>(query: string, params?: unknown[]) {
      const rows = await target.unsafe(query, params as any[]);
      return rows[0] as T | undefined;
    },
    async run(query: string, params?: unknown[]) {
      const res = await target.unsafe(query, params as any[]);
      const result = res as unknown as { count: number };
      return { changes: Number(result.count ?? 0) };
    },
  };
}

export function createPostgresJsStorage(sql: Sql, dialect: DialectConfig = PostgresDialect) {
  const executor: QueryExecutor = {
    ...wrapPostgresJs(sql),
    transaction<T>(cb: (ex: QueryExecutor) => Promise<T>): Promise<T> {
      return sql.begin((tx) => {
        const txExecutor: QueryExecutor = {
          ...wrapPostgresJs(tx),
          transaction<U>(innerCb: (ex: QueryExecutor) => Promise<U>) {
            return innerCb(txExecutor);
          },
        };
        return cb(txExecutor);
      }) as unknown as Promise<T>;
    },
  };

  return createSqlStorage(executor, dialect);
}

export function wrapBunSql(target: SQL) {
  return {
    async all<T>(query: string, params?: unknown[]) {
      return (await target.unsafe(query, params)) as T[];
    },
    async get<T>(query: string, params?: unknown[]) {
      const rows = await target.unsafe(query, params);
      return rows[0] as T | undefined;
    },
    async run(query: string, params?: unknown[]) {
      const res = await target.unsafe(query, params);
      const result = res as unknown as { affectedRows?: number; count?: number; length: number };
      return { changes: Number(result.affectedRows ?? result.count ?? result.length ?? 0) };
    },
  };
}

export function createBunPostgresStorage(sql: SQL, dialect: DialectConfig = PostgresDialect) {
  const executor: QueryExecutor = {
    ...wrapBunSql(sql),
    transaction<T>(cb: (ex: QueryExecutor) => Promise<T>): Promise<T> {
      return sql.begin((tx) => {
        const txExecutor: QueryExecutor = {
          ...wrapBunSql(tx),
          transaction<U>(innerCb: (ex: QueryExecutor) => Promise<U>) {
            return innerCb(txExecutor);
          },
        };
        return cb(txExecutor);
      });
    },
  };

  return createSqlStorage(executor, dialect);
}
