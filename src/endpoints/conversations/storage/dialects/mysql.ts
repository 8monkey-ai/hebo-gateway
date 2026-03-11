import type { SQL as BunSql } from "bun";
import type { Pool as Mysql2Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

import type { DialectConfig, QueryExecutor, SqlDialect } from "./types";
import { createParamsMapper, dateToNumber, jsonStringify } from "./utils";

export type { Mysql2Pool };

const mapParams = createParamsMapper([dateToNumber, jsonStringify]);

export const MySQLDialectConfig: DialectConfig = {
  placeholder: () => "?",
  quote: (i) => `\`${i}\``,
  upsertSuffix: (q, _pk, cols) =>
    `ON DUPLICATE KEY UPDATE ${cols.map((c) => `${q(c)} = VALUES(${q(c)})`).join(", ")}`,
  limitAsLiteral: true,
  supportCreateIndexIfNotExists: false,
  types: {
    varchar: "VARCHAR",
    json: "JSON",
    timestamp: "BIGINT",
    index: "B-TREE",
  },
};

function isMysql2(client: unknown): client is Mysql2Pool {
  const c = client as Record<string, unknown>;
  return !!client && typeof c["execute"] === "function" && typeof c["getConnection"] === "function";
}

function isBunSql(client: unknown): client is BunSql {
  const c = client as Record<string, unknown>;
  return !!client && typeof c["unsafe"] === "function" && typeof c["transaction"] === "function";
}

function createMysql2Executor(pool: Mysql2Pool): QueryExecutor {
  const executor: QueryExecutor = {
    async all<T>(sql: string, params?: unknown[]) {
      const [rows] = await pool.execute(sql, mapParams(params));
      return rows as T[];
    },
    async get<T>(sql: string, params?: unknown[]) {
      const [rows] = await pool.execute(sql, mapParams(params));
      return (rows as RowDataPacket[])?.[0] as T | undefined;
    },
    async run(sql: string, params?: unknown[]) {
      const [res] = await pool.execute(sql, mapParams(params));
      const header = res as unknown as ResultSetHeader;
      return { changes: Number(header.affectedRows ?? 0) };
    },
    async transaction<T>(fn: (executor: QueryExecutor) => Promise<T>) {
      const conn = await pool.getConnection();
      await conn.beginTransaction();
      const txExecutor: QueryExecutor = {
        async all<R>(sql: string, params?: unknown[]) {
          const [rows] = await conn.execute(sql, mapParams(params));
          return rows as R[];
        },
        async get<R>(sql: string, params?: unknown[]) {
          const [rows] = await conn.execute(sql, mapParams(params));
          return (rows as RowDataPacket[])?.[0] as R | undefined;
        },
        async run(sql: string, params?: unknown[]) {
          const [res] = await conn.execute(sql, mapParams(params));
          const header = res as unknown as ResultSetHeader;
          return { changes: Number(header.affectedRows ?? 0) };
        },
        transaction: (f: (executor: QueryExecutor) => Promise<unknown>) => f(txExecutor),
      } as QueryExecutor;

      try {
        const result = await fn(txExecutor);
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

  return executor;
}

function createBunMysqlExecutor(sql: BunSql): QueryExecutor {
  const executor: QueryExecutor = {
    all<T>(query: string, params?: unknown[]) {
      return sql.unsafe(query, mapParams(params)) as Promise<T[]>;
    },
    async get<T>(query: string, params?: unknown[]) {
      const rows = await (sql.unsafe(query, mapParams(params)) as Promise<unknown[]>);
      return rows?.[0] as T | undefined;
    },
    async run(query: string, params?: unknown[]) {
      const res = (await sql.unsafe(query, mapParams(params))) as unknown;
      const result = res as { affectedRows?: number; count?: number; length: number };
      return { changes: Number(result.affectedRows ?? result.count ?? result.length ?? 0) };
    },
    transaction<T>(fn: (executor: QueryExecutor) => Promise<T>) {
      return sql.transaction((tx) => {
        return fn(createBunMysqlExecutor(tx as unknown as BunSql));
      });
    },
  };
  return executor;
}

export class MysqlDialect implements SqlDialect {
  readonly executor: QueryExecutor;
  readonly config: DialectConfig;

  constructor(options: { client: Mysql2Pool | BunSql; config?: DialectConfig }) {
    const { client, config = MySQLDialectConfig } = options;
    this.config = config;

    if (isMysql2(client)) {
      this.executor = createMysql2Executor(client);
    } else if (isBunSql(client)) {
      this.executor = createBunMysqlExecutor(client);
    } else {
      throw new Error("Unsupported MySQL client");
    }
  }
}
