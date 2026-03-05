import type { SQL as BunSql } from "bun";
import type { Pool as Mysql2Pool } from "mysql2/promise";

import { createBunMysqlStorage, createMysql2Storage } from "./mysql";
import {
  createBunPostgresStorage,
  createPgStorage,
  createPostgresJsStorage,
  type PgPool,
  type PostgresJsSql,
} from "./postgres";
import { type DialectConfig } from "./sql/types";

export const GrepTimeDialect: DialectConfig = {
  placeholder: (i) => `$${i + 1}`,
  partitioned: true,
  types: {
    varchar: "VARCHAR",
    json: "JSON",
    int64: "TIMESTAMP",
    index: "none",
    timeIndex: true,
  },
};

export const GrepTimeMySQLDialect: DialectConfig = {
  placeholder: () => "?",
  partitioned: true,
  types: {
    varchar: "VARCHAR",
    json: "JSON",
    int64: "TIMESTAMP",
    index: "none",
    timeIndex: true,
  },
};

export function createGrepTimePgStorage(pool: PgPool) {
  return createPgStorage(pool, GrepTimeDialect);
}

export function createGrepTimePostgresJsStorage(sql: PostgresJsSql) {
  return createPostgresJsStorage(sql, GrepTimeDialect);
}

/**
 * @deprecated Use createGrepTimePostgresJsStorage or createGrepTimeBunPostgresStorage instead
 */
export function createGrepTimeBunStorage(sql: PostgresJsSql) {
  return createPostgresJsStorage(sql, GrepTimeDialect);
}

export function createGrepTimeBunPostgresStorage(sql: BunSql) {
  return createBunPostgresStorage(sql, GrepTimeDialect);
}

export function createGrepTimeMysql2Storage(pool: Mysql2Pool) {
  return createMysql2Storage(pool, GrepTimeMySQLDialect);
}

export function createGrepTimeBunMysqlStorage(sql: BunSql) {
  return createBunMysqlStorage(sql, GrepTimeMySQLDialect);
}
