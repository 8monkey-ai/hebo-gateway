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
};

export class GrepTimeDialect implements SqlDialect {
  readonly executor: QueryExecutor;
  readonly config: DialectConfig = GrepTimeDialectConfig;

  constructor(options: { client: PgPool | PostgresJsSql | BunSql | any }) {
    const { client } = options;
    const dialect = new PostgresDialect({ client, config: this.config });

    this.executor = dialect.executor;
    this.config = dialect.config;
  }
}
