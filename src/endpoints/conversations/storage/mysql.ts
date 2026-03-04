import type { SQL } from "bun";
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";

import type { DialectConfig, QueryExecutor } from "./sql/types";

import { createSqlStorage } from "./sql/factory";

export const MySQLDialect: DialectConfig = {
  placeholder: () => "?",
  idType: "VARCHAR(255)",
  objectType: "VARCHAR(64)",
  jsonType: "JSON",
  createdAtType: "BIGINT",
};

const mapParams = (params?: unknown[]) =>
  params?.map((p) => (p !== null && typeof p === "object" ? JSON.stringify(p) : p));

function wrapMysql2(target: Pool | PoolConnection) {
  return {
    async all<T>(sql: string, params?: unknown[]) {
      const [rows] = await target.query(sql, mapParams(params));
      return rows as T[];
    },
    async get<T>(sql: string, params?: unknown[]) {
      const [rows] = await target.query(sql, mapParams(params));
      return (rows as RowDataPacket[])[0] as T | undefined;
    },
    async run(sql: string, params?: unknown[]) {
      const [res] = await target.query(sql, mapParams(params));
      const header = res as unknown as ResultSetHeader;
      return { changes: Number(header.affectedRows ?? 0) };
    },
  };
}

export function createMysql2Storage(pool: Pool) {
  const executor: QueryExecutor = {
    ...wrapMysql2(pool),
    async transaction<T>(cb: (ex: QueryExecutor) => Promise<T>): Promise<T> {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const txExecutor: QueryExecutor = {
          ...wrapMysql2(conn),
          transaction<U>(innerCb: (ex: QueryExecutor) => Promise<U>) {
            return innerCb(txExecutor);
          },
        };
        const res = await cb(txExecutor);
        await conn.commit();
        return res;
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    },
  };

  return createSqlStorage(executor, MySQLDialect);
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
      // Bun.SQL result has affectedRows for MySQL
      const result = res as unknown as { affectedRows?: number; count?: number; length: number };
      return { changes: Number(result.affectedRows ?? result.count ?? result.length ?? 0) };
    },
  };
}

export function createBunMysqlStorage(sql: SQL) {
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

  return createSqlStorage(executor, MySQLDialect);
}
