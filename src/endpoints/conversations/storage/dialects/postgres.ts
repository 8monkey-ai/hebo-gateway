import type { SQL as BunSql } from "bun";
import type { Pool as PgPool } from "pg";
import type { Sql as PostgresJsSql } from "postgres";

import { LRUCache } from "lru-cache";

import { type DialectConfig, type QueryExecutor, type SqlDialect } from "./types";
import { createParamsMapper, dateToNumber } from "./utils";

export type { PostgresJsSql, PgPool };

const mapParams = createParamsMapper(dateToNumber);

export const PostgresDialectConfig: DialectConfig = {
  placeholder: (i) => `$${i + 1}`,
  quote: (i) => `"${i}"`,
  upsertSuffix: (q, pk, cols) =>
    `ON CONFLICT (${pk.map((c) => q(c)).join(", ")}) DO UPDATE SET ${cols
      .map((c) => `${q(c)} = EXCLUDED.${q(c)}`)
      .join(", ")}`,
  supportCreateIndexIfNotExists: true,
  types: {
    varchar: "VARCHAR",
    json: "JSONB",
    timestamp: "BIGINT",
    index: "BRIN",
  },
};

const MAX_CACHE_SIZE = 100;

function isPgPool(client: unknown): client is PgPool {
  const c = client as Record<string, unknown>;
  return !!client && typeof c["query"] === "function" && typeof c["connect"] === "function";
}

function isPostgresJs(client: unknown): client is PostgresJsSql {
  const c = client as Record<string, unknown>;
  return !!client && typeof c["unsafe"] === "function" && typeof c["begin"] === "function";
}

function isBunSql(client: unknown): client is BunSql {
  const c = client as Record<string, unknown>;
  return !!client && typeof c["unsafe"] === "function" && typeof c["transaction"] === "function";
}

function createPgExecutor(pool: PgPool): QueryExecutor {
  const cache = new LRUCache<string, string>({ max: MAX_CACHE_SIZE });
  let count = 0;

  const getQuery = (sql: string, values?: unknown[]) => {
    let name = cache.get(sql);
    if (!name) {
      name = `q_${count++}`;
      cache.set(sql, name);
    }
    return { name, text: sql, values };
  };

  const executor: QueryExecutor = {
    async all<T>(sql: string, params?: unknown[]) {
      const res = await pool.query(getQuery(sql, mapParams(params)));
      return res.rows as T[];
    },
    async get<T>(sql: string, params?: unknown[]) {
      const res = await pool.query(getQuery(sql, mapParams(params)));
      return res.rows?.[0] as T | undefined;
    },
    async run(sql: string, params?: unknown[]) {
      const res = await pool.query(getQuery(sql, mapParams(params)));
      return { changes: Number(res.rowCount ?? 0) };
    },
    async transaction<T>(fn: (executor: QueryExecutor) => Promise<T>) {
      const client = await pool.connect();
      await client.query("BEGIN");
      try {
        const result = await fn({
          async all<R>(sql: string, params?: unknown[]) {
            const res = await client.query(getQuery(sql, mapParams(params)));
            return res.rows as R[];
          },
          async get<R>(sql: string, params?: unknown[]) {
            const res = await client.query(getQuery(sql, mapParams(params)));
            return res.rows?.[0] as R | undefined;
          },
          async run(sql: string, params?: unknown[]) {
            const res = await client.query(getQuery(sql, mapParams(params)));
            return { changes: Number(res.rowCount ?? 0) };
          },
          transaction: (f: (executor: QueryExecutor) => Promise<unknown>) => f(executor),
        } as QueryExecutor);
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
  };

  return executor;
}
function createPostgresJsExecutor(sql: PostgresJsSql): QueryExecutor {
  const executor: QueryExecutor = {
    async all<T>(query: string, params?: unknown[]) {
      return (await sql.unsafe(
        query,
        (mapParams(params) ?? []) as Parameters<PostgresJsSql["unsafe"]>[1],
        { prepare: true },
      )) as T[];
    },
    async get<T>(query: string, params?: unknown[]) {
      const rows = await sql.unsafe(
        query,
        (mapParams(params) ?? []) as Parameters<PostgresJsSql["unsafe"]>[1],
        { prepare: true },
      );
      return rows?.[0] as T | undefined;
    },
    async run(query: string, params?: unknown[]) {
      const res = await sql.unsafe(
        query,
        (mapParams(params) ?? []) as Parameters<PostgresJsSql["unsafe"]>[1],
        { prepare: true },
      );
      const result = res as unknown as { count: number };
      return { changes: Number(result.count ?? 0) };
    },
    async transaction<T>(fn: (executor: QueryExecutor) => Promise<T>): Promise<T> {
      return (await sql.begin(() => fn(executor))) as T;
    },
  };
  return executor;
}

function createBunPostgresExecutor(sql: BunSql): QueryExecutor {
  const executor: QueryExecutor = {
    async all<T>(query: string, params?: unknown[]) {
      return (await sql.unsafe(query, mapParams(params))) as T[];
    },
    async get<T>(query: string, params?: unknown[]) {
      const rows = await sql.unsafe(query, mapParams(params));
      return rows?.[0] as T | undefined;
    },
    async run(query: string, params?: unknown[]) {
      const res = await sql.unsafe(query, mapParams(params));
      const result = res as unknown as { affectedRows?: number; count?: number; length: number };
      return { changes: Number(result.affectedRows ?? result.count ?? result.length ?? 0) };
    },
    async transaction<T>(fn: (executor: QueryExecutor) => Promise<T>) {
      return await sql.transaction(() => fn(executor));
    },
  };
  return executor;
}

export class PostgresDialect implements SqlDialect {
  readonly executor: QueryExecutor;
  readonly config: DialectConfig;

  constructor(options: {
    client: PgPool | PostgresJsSql | BunSql | unknown;
    config?: DialectConfig;
  }) {
    const { client, config = PostgresDialectConfig } = options;
    this.config = config;

    if (isPgPool(client)) {
      this.executor = createPgExecutor(client);
    } else if (isPostgresJs(client)) {
      this.executor = createPostgresJsExecutor(client);
    } else if (isBunSql(client)) {
      this.executor = createBunPostgresExecutor(client);
    } else {
      throw new Error("Unsupported Postgres client");
    }
  }
}
