import type { Client as LibsqlClient, Transaction } from "@libsql/client";
import type { Database as BetterSqlite3Database } from "better-sqlite3";
import type { SQL } from "bun";

import type { DialectConfig, QueryExecutor } from "./sql/types";

import { createSqlStorage } from "./sql/factory";

export const SQLiteDialect: DialectConfig = {
  placeholder: () => "?",
  idType: "TEXT",
  objectType: "TEXT",
  jsonType: "TEXT",
  createdAtType: "INTEGER",
};

const mapParams = (params?: unknown[]) =>
  params?.map((p) => (p !== null && typeof p === "object" ? JSON.stringify(p) : p)) as (
    | string
    | number
    | boolean
    | null
  )[];

export function createBetterSqlite3Storage(db: BetterSqlite3Database) {
  const executor: QueryExecutor = {
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
    transaction<T>(cb: (ex: QueryExecutor) => Promise<T>): Promise<T> {
      return Promise.resolve(db.transaction(() => cb(executor))() as Promise<T>);
    },
  };

  return createSqlStorage(executor, SQLiteDialect);
}

function wrapLibsql(target: LibsqlClient | Transaction) {
  return {
    async all<T>(sql: string, params?: unknown[]) {
      const rs = await target.execute({ sql, args: mapParams(params) ?? [] });
      return rs.rows as unknown as T[];
    },
    async get<T>(sql: string, params?: unknown[]) {
      const rs = await target.execute({ sql, args: mapParams(params) ?? [] });
      return rs.rows[0] as unknown as T | undefined;
    },
    async run(sql: string, params?: unknown[]) {
      const rs = await target.execute({ sql, args: mapParams(params) ?? [] });
      return { changes: Number(rs.rowsAffected) };
    },
  };
}

export function createLibsqlStorage(client: LibsqlClient) {
  const executor: QueryExecutor = {
    ...wrapLibsql(client),
    async transaction<T>(cb: (ex: QueryExecutor) => Promise<T>): Promise<T> {
      const tx = await client.transaction("write");
      try {
        const txExecutor: QueryExecutor = {
          ...wrapLibsql(tx),
          transaction<U>(innerCb: (ex: QueryExecutor) => Promise<U>) {
            return innerCb(txExecutor);
          },
        };
        const res = await cb(txExecutor);
        await tx.commit();
        return res;
      } catch (e) {
        await tx.rollback();
        throw e;
      } finally {
        tx.close();
      }
    },
  };

  return createSqlStorage(executor, SQLiteDialect);
}

function wrapBunSql(sql: SQL) {
  return {
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
  };
}

export function createBunSqliteStorage(sql: SQL) {
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

  return createSqlStorage(executor, SQLiteDialect);
}
