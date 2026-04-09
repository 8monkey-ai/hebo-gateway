import { LRUCache } from "lru-cache";
import type { Pool as PgPool } from "pg";
import type { Sql as PostgresJsSql, TransactionSql } from "postgres";

import { type BunSql, type DialectConfig, type QueryExecutor, type SqlDialect } from "./types";
import { createParamsMapper, dateToNumber, escapeSqlString } from "./utils";

export type { PostgresJsSql, PgPool };

const defaultMapParams = createParamsMapper([dateToNumber]);

export const PostgresDialectConfig: DialectConfig = {
  placeholder: (i) => `$${i + 1}`,
  quote: (i) => `"${i}"`,
  selectJson: (c) => c,
  jsonExtract: (c, k) => `${c}->>'${escapeSqlString(k)}'`,
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

export function isPgPool(client: unknown): client is PgPool {
  const c = client as Record<string, unknown>;
  return !!client && typeof c["query"] === "function" && typeof c["connect"] === "function";
}

function isPostgresJs(client: unknown): client is PostgresJsSql {
  const c = client as Record<string, unknown>;
  return (
    !!client &&
    typeof c["unsafe"] === "function" &&
    typeof c["begin"] === "function" &&
    !("transaction" in c)
  );
}

export function isBunSql(client: unknown): client is BunSql {
  const c = client as Record<string, unknown>;
  return !!client && typeof c["unsafe"] === "function" && typeof c["transaction"] === "function";
}

function createPgExecutor(
  pool: PgPool,
  mapParams: (params?: unknown[]) => (string | number | bigint | boolean | null)[],
): QueryExecutor {
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
      const p = mapParams(params);
      const res = await pool.query(getQuery(sql, p?.length > 0 ? p : undefined));
      return res.rows as T[];
    },
    async get<T>(sql: string, params?: unknown[]) {
      const p = mapParams(params);
      const res = await pool.query(getQuery(sql, p?.length > 0 ? p : undefined));
      return res.rows?.[0] as T | undefined;
    },
    async run(sql: string, params?: unknown[]) {
      const p = mapParams(params);
      const res = await pool.query(getQuery(sql, p?.length > 0 ? p : undefined));
      return { changes: res.rowCount ?? 0 };
    },
    async transaction<T>(fn: (executor: QueryExecutor) => Promise<T>) {
      const client = await pool.connect();
      await client.query("BEGIN");
      const txExecutor: QueryExecutor = {
        async all<R>(sql: string, params?: unknown[]) {
          const p = mapParams(params);
          const res = await client.query(getQuery(sql, p?.length > 0 ? p : undefined));
          return res.rows as R[];
        },
        async get<R>(sql: string, params?: unknown[]) {
          const p = mapParams(params);
          const res = await client.query(getQuery(sql, p?.length > 0 ? p : undefined));
          return res.rows?.[0] as R | undefined;
        },
        async run(sql: string, params?: unknown[]) {
          const p = mapParams(params);
          const res = await client.query(getQuery(sql, p?.length > 0 ? p : undefined));
          return { changes: res.rowCount ?? 0 };
        },
        transaction<ResultT>(
          txCallback: (executor: QueryExecutor) => Promise<ResultT>,
        ): Promise<ResultT> {
          return txCallback(txExecutor);
        },
      } satisfies QueryExecutor;

      try {
        const result = await fn(txExecutor);
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

function createPostgresJsExecutor(
  sql: PostgresJsSql | TransactionSql,
  mapParams: (params?: unknown[]) => (string | number | bigint | boolean | null)[],
): QueryExecutor {
  const executor: QueryExecutor = {
    async all<T>(query: string, params?: unknown[]) {
      const p = mapParams(params);
      return (await sql.unsafe(
        query,
        (p?.length > 0 ? p : undefined) as Parameters<PostgresJsSql["unsafe"]>[1],
        { prepare: true },
      )) as T[];
    },
    async get<T>(query: string, params?: unknown[]) {
      const p = mapParams(params);
      const rows = await sql.unsafe(
        query,
        (p?.length > 0 ? p : undefined) as Parameters<PostgresJsSql["unsafe"]>[1],
        { prepare: true },
      );
      return rows?.[0] as T | undefined;
    },
    async run(query: string, params?: unknown[]) {
      const p = mapParams(params);
      const res = await sql.unsafe(
        query,
        (p?.length > 0 ? p : undefined) as Parameters<PostgresJsSql["unsafe"]>[1],
        { prepare: true },
      );
      const result = res as unknown as { count: number };
      return { changes: result.count ?? 0 };
    },
    async transaction<T>(fn: (executor: QueryExecutor) => Promise<T>): Promise<T> {
      return (await (sql as PostgresJsSql).begin((tx) => {
        const txExecutor = createPostgresJsExecutor(tx, mapParams);
        txExecutor.transaction = <R>(f: (executor: QueryExecutor) => Promise<R>) => f(txExecutor);
        return fn(txExecutor);
      })) as T;
    },
  };
  return executor;
}

function createBunPostgresExecutor(
  sql: BunSql,
  mapParams: (params?: unknown[]) => (string | number | bigint | boolean | null)[],
): QueryExecutor {
  const executor: QueryExecutor = {
    all<T>(query: string, params?: unknown[]) {
      const p = mapParams(params);
      return sql.unsafe<T[]>(query, p?.length > 0 ? p : undefined);
    },
    async get<T>(query: string, params?: unknown[]) {
      const p = mapParams(params);
      const rows = await sql.unsafe<unknown[]>(query, p?.length > 0 ? p : undefined);
      return rows?.[0] as T | undefined;
    },
    async run(query: string, params?: unknown[]) {
      const p = mapParams(params);
      const res = (await sql.unsafe(query, p?.length > 0 ? p : undefined)) as unknown;
      const result = res as {
        affectedRows?: number;
        count?: number;
        command?: string;
      };

      let changes = result.affectedRows ?? result.count ?? 0;

      // When Bun.SQL is used with GreptimeDB, mutation responses over the Postgres wire
      // protocol don't populate `count` or `affectedRows`, but they do provide a command
      // string like "OK 1"
      if (changes === 0 && result.command?.startsWith("OK ")) {
        const parsed = parseInt(result.command.slice(3), 10);
        if (!isNaN(parsed)) changes = parsed;
      }

      return { changes };
    },
    transaction<T>(fn: (executor: QueryExecutor) => Promise<T>) {
      return sql.transaction((tx) => {
        const txExecutor = createBunPostgresExecutor(tx as unknown as BunSql, mapParams);
        txExecutor.transaction = <R>(f: (executor: QueryExecutor) => Promise<R>) => f(txExecutor);
        return fn(txExecutor);
      });
    },
  };
  return executor;
}

export class PostgresDialect implements SqlDialect {
  readonly executor: QueryExecutor;
  readonly config: DialectConfig;

  constructor(options: {
    client: PgPool | PostgresJsSql | BunSql;
    config?: DialectConfig;
    mapParams?: (params?: unknown[]) => (string | number | bigint | boolean | null)[];
  }) {
    const { client, config = PostgresDialectConfig, mapParams = defaultMapParams } = options;
    this.config = config;

    if (isPgPool(client)) {
      this.executor = createPgExecutor(client, mapParams);
    } else if (isBunSql(client)) {
      this.executor = createBunPostgresExecutor(client, mapParams);
    } else if (isPostgresJs(client)) {
      this.executor = createPostgresJsExecutor(client, mapParams);
    } else {
      throw new Error("Unsupported Postgres client");
    }
  }
}
