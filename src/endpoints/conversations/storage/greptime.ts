import {
  createPgStorage,
  createPostgresJsStorage,
  type PgPool,
  type PostgresJsSql,
} from "./postgres";
import { type DialectConfig } from "./sql/types";

export const GrepTimeDialect: DialectConfig = {
  placeholder: (i) => `$${i + 1}`,
  idType: "VARCHAR(255)",
  objectType: "VARCHAR(64)",
  jsonType: "JSON",
  createdAtType: "TIMESTAMP",
  supportsIndex: false,
};

export function createGrepTimePgStorage(pool: PgPool) {
  return createPgStorage(pool, GrepTimeDialect);
}

export function createGrepTimePostgresJsStorage(sql: PostgresJsSql) {
  return createPostgresJsStorage(sql, GrepTimeDialect);
}

export function createGrepTimeBunStorage(sql: PostgresJsSql) {
  return createPostgresJsStorage(sql, GrepTimeDialect);
}
