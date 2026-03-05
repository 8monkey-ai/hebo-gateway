import type { Client as LibsqlClient } from "@libsql/client";
import type { Database as BetterSqlite3Database } from "better-sqlite3";
import type { SQL as BunSql } from "bun";

import type { DialectConfig, SqlDialect } from "./types";

export const SQLiteDialect: DialectConfig = {
  placeholder: () => "?",
  types: {
    varchar: "TEXT",
    json: "TEXT",
    timestamp: "INTEGER",
    index: "B-TREE",
  },
};

const mapParams = (params?: unknown[]) =>
  params?.map((p) => (p !== null && typeof p === "object" ? JSON.stringify(p) : p)) as (
    | string
    | number
    | boolean
    | null
  )[];

export function createBetterSqlite3Dialect(db: BetterSqlite3Database): SqlDialect {
  return {
    executor: {
      all<T>(sql: string, params?: unknown[]) {
        return Promise.resolve(db.prepare(sql).all(...(mapParams(params) ?? [])) as T[]);
      },
      get<T>(sql: string, params?: unknown[]) {
        return Promise.resolve(db.prepare(sql).get(...(mapParams(params) ?? [])) as T | undefined);
      },
      run(sql: string, params?: unknown[]) {
        const info = db.prepare(sql).run(...(mapParams(params) ?? []));
        return Promise.resolve({ changes: info.changes });
      },
    },
    config: SQLiteDialect,
  };
}

export function createLibsqlDialect(client: LibsqlClient): SqlDialect {
  return {
    executor: {
      async all<T>(sql: string, params?: unknown[]) {
        const rs = await client.execute({ sql, args: mapParams(params) ?? [] });
        return rs.rows as unknown as T[];
      },
      async get<T>(sql: string, params?: unknown[]) {
        const rs = await client.execute({ sql, args: mapParams(params) ?? [] });
        return rs.rows[0] as unknown as T | undefined;
      },
      async run(sql: string, params?: unknown[]) {
        const rs = await client.execute({ sql, args: mapParams(params) ?? [] });
        return { changes: Number(rs.rowsAffected) };
      },
    },
    config: SQLiteDialect,
  };
}

export function createBunSqliteDialect(sql: BunSql): SqlDialect {
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
    config: SQLiteDialect,
  };
}
