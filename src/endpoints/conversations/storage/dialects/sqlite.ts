import type { Client as LibsqlClient } from "@libsql/client";
import type { Database as BetterSqlite3Database, Statement } from "better-sqlite3";
import type { SQL as BunSql } from "bun";

import type { DialectConfig, QueryExecutor, SqlDialect } from "./types";
import { createParamsMapper, dateToNumber, jsonStringify } from "./utils";

const mapParams = createParamsMapper(dateToNumber, jsonStringify);

export const SQLiteDialectConfig: DialectConfig = {
  placeholder: () => "?",
  quote: (i) => `"${i}"`,
  upsertSuffix: (q, pk, cols) =>
    `ON CONFLICT (${pk.map((c) => q(c)).join(", ")}) DO UPDATE SET ${cols
      .map((c) => `${q(c)} = EXCLUDED.${q(c)}`)
      .join(", ")}`,
  supportCreateIndexIfNotExists: true,
  types: {
    varchar: "TEXT",
    json: "TEXT",
    timestamp: "BIGINT",
    index: "B-TREE",
  },
};

const MAX_CACHE_SIZE = 100;

function isBetterSqlite3(client: unknown): client is BetterSqlite3Database {
  const c = client as Record<string, unknown>;
  return !!client && typeof c["prepare"] === "function" && typeof c["transaction"] === "function";
}

function isLibsql(client: unknown): client is LibsqlClient {
  const c = client as Record<string, unknown>;
  return !!client && typeof c["execute"] === "function" && typeof c["batch"] === "function";
}

function isBunSql(client: unknown): client is BunSql {
  const c = client as Record<string, unknown>;
  return !!client && typeof c["unsafe"] === "function" && typeof c["transaction"] === "function";
}

function createBetterSqlite3Executor(db: BetterSqlite3Database): QueryExecutor {
  const cache = new Map<string, Statement>();

  const getStmt = (sql: string) => {
    let stmt = cache.get(sql);
    if (!stmt) {
      if (cache.size >= MAX_CACHE_SIZE) {
        const firstKey = cache.keys().next().value;
        if (firstKey !== undefined) cache.delete(firstKey);
      }
      stmt = db.prepare(sql);
      cache.set(sql, stmt);
    }
    return stmt;
  };

  const executor: QueryExecutor = {
    all<T>(sql: string, params?: unknown[]) {
      return Promise.resolve(getStmt(sql).all(...(mapParams(params) ?? [])) as T[]);
    },
    get<T>(sql: string, params?: unknown[]) {
      return Promise.resolve(getStmt(sql).get(...(mapParams(params) ?? [])) as T | undefined);
    },
    run(sql: string, params?: unknown[]) {
      const info = getStmt(sql).run(...(mapParams(params) ?? []));
      return Promise.resolve({ changes: info.changes });
    },
    transaction<T>(fn: (executor: QueryExecutor) => Promise<T>) {
      const res = db.transaction(() => fn(executor))();
      return Promise.resolve(res as T);
    },
  };

  return executor;
}

function createLibsqlExecutor(client: LibsqlClient): QueryExecutor {
  const executor: QueryExecutor = {
    async all<T>(sql: string, params?: unknown[]) {
      const rs = await client.execute({ sql, args: mapParams(params) ?? [] });
      return rs.rows as unknown as T[];
    },
    async get<T>(sql: string, params?: unknown[]) {
      const rs = await client.execute({ sql, args: mapParams(params) ?? [] });
      return rs.rows?.[0] as unknown as T | undefined;
    },
    async run(sql: string, params?: unknown[]) {
      const rs = await client.execute({ sql, args: mapParams(params) ?? [] });
      return { changes: Number(rs.rowsAffected) };
    },
    async transaction<T>(fn: (executor: QueryExecutor) => Promise<T>) {
      const tx = await client.transaction("deferred");
      try {
        const result = await fn({
          async all<R>(sql: string, params?: unknown[]) {
            const rs = await tx.execute({ sql, args: mapParams(params) ?? [] });
            return rs.rows as unknown as R[];
          },
          async get<R>(sql: string, params?: unknown[]) {
            const rs = await tx.execute({ sql, args: mapParams(params) ?? [] });
            return rs.rows?.[0] as unknown as R | undefined;
          },
          async run(sql: string, params?: unknown[]) {
            const rs = await tx.execute({ sql, args: mapParams(params) ?? [] });
            return { changes: Number(rs.rowsAffected) };
          },
          transaction: (f: (executor: QueryExecutor) => Promise<unknown>) => f(executor),
        } as QueryExecutor);
        await tx.commit();
        return result;
      } catch (err) {
        await tx.rollback();
        throw err;
      }
    },
  };

  return executor;
}

function createBunSqliteExecutor(sql: BunSql): QueryExecutor {
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

export class SqliteDialect implements SqlDialect {
  readonly executor: QueryExecutor;
  readonly config: DialectConfig = SQLiteDialectConfig;

  constructor(options: { client: BetterSqlite3Database | LibsqlClient | BunSql | unknown }) {
    const { client } = options;

    if (isBetterSqlite3(client)) {
      this.executor = createBetterSqlite3Executor(client);
    } else if (isLibsql(client)) {
      this.executor = createLibsqlExecutor(client);
    } else if (isBunSql(client)) {
      this.executor = createBunSqliteExecutor(client);
    } else {
      throw new Error("Unsupported SQLite client");
    }
  }
}
