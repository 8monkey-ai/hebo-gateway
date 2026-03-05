import type { SQL as BunSql } from "bun";
import type { Pool as Mysql2Pool } from "mysql2/promise";

import { createBunMysqlDialect, createMysql2Dialect, MySQLDialect } from "./mysql";
import {
  createBunPostgresDialect,
  createPgDialect,
  createPostgresJsDialect,
  PostgresDialect,
  type PgPool,
  type PostgresJsSql,
} from "./postgres";
import { type DialectConfig, type SqlDialect } from "./types";

const GrepTimeBase: Pick<DialectConfig, "partitioned" | "types"> = {
  partitioned: true,
  types: {
    varchar: "VARCHAR",
    json: "JSON",
    timestamp: "TIMESTAMP",
    index: "none",
    timeIndex: true,
  },
};

export const GrepTimePostgresDialect: DialectConfig = {
  ...PostgresDialect,
  ...GrepTimeBase,
};

export const GrepTimeMySQLDialect: DialectConfig = {
  ...MySQLDialect,
  ...GrepTimeBase,
};

export function createGrepTimePgDialect(pool: PgPool): SqlDialect {
  return createPgDialect(pool, GrepTimePostgresDialect);
}

export function createGrepTimePostgresJsDialect(sql: PostgresJsSql): SqlDialect {
  return createPostgresJsDialect(sql, GrepTimePostgresDialect);
}

export function createGrepTimeBunPostgresDialect(sql: BunSql): SqlDialect {
  return createBunPostgresDialect(sql, GrepTimePostgresDialect);
}

export function createGrepTimeMysql2Dialect(pool: Mysql2Pool): SqlDialect {
  return createMysql2Dialect(pool, GrepTimeMySQLDialect);
}

export function createGrepTimeBunMysqlDialect(sql: BunSql): SqlDialect {
  return createBunMysqlDialect(sql, GrepTimeMySQLDialect);
}
