import type { SQL as BunSql } from "bun";

import {
  PostgresDialect,
  PostgresDialectConfig,
  type PgPool,
  type PostgresJsSql,
} from "./postgres";
import { type DialectConfig, type QueryExecutor, type SqlDialect } from "./types";

const GrepTimeBase: Pick<DialectConfig, "types"> = {
  types: {
    varchar: "VARCHAR",
    json: "JSON",
    timestamp: "TIMESTAMP",
    timestampNow: "now()",
    index: "TIME",
  },
};

export const GrepTimeDialectConfig: DialectConfig = {
  ...PostgresDialectConfig,
  ...GrepTimeBase,
  supportUpdate: false,
  limitAsLiteral: true,
};

const mapParams = (params?: unknown[]) =>
  params?.map((p) =>
    p !== null && typeof p === "object" && !(p instanceof Date) ? JSON.stringify(p) : p,
  );

export class GrepTimeDialect implements SqlDialect {
  readonly executor: QueryExecutor;
  readonly config: DialectConfig = GrepTimeDialectConfig;

  constructor(options: { client: PgPool | PostgresJsSql | BunSql | any }) {
    const { client } = options;
    const dialect = new PostgresDialect({ client, config: this.config });

    const base = dialect.executor;
    this.executor = {
      ...base,
      all: (sql, params) => base.all(sql, mapParams(params)),
      get: (sql, params) => base.get(sql, mapParams(params)),
      run: (sql, params) => base.run(sql, mapParams(params)),
      transaction: (fn) =>
        base.transaction((tx) =>
          fn({
            ...tx,
            all: (sql, params) => tx.all(sql, mapParams(params)),
            get: (sql, params) => tx.get(sql, mapParams(params)),
            run: (sql, params) => tx.run(sql, mapParams(params)),
          } as QueryExecutor),
        ),
    };
  }
}
