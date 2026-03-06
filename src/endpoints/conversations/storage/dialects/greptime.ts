import type { SQL as BunSql } from "bun";
import type { Pool as Mysql2Pool } from "mysql2/promise";

import { MySQLDialectConfig, MysqlDialect } from "./mysql";
import {
  PostgresDialect,
  PostgresDialectConfig,
  type PgPool,
  type PostgresJsSql,
} from "./postgres";
import { type DialectConfig, type QueryExecutor, type SqlDialect } from "./types";

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

export const GrepTimePostgresDialectConfig: DialectConfig = {
  ...PostgresDialectConfig,
  ...GrepTimeBase,
};

export const GrepTimeMySQLDialectConfig: DialectConfig = {
  ...MySQLDialectConfig,
  ...GrepTimeBase,
};

export class GrepTimeDialect implements SqlDialect {
  readonly executor: QueryExecutor;
  readonly config: DialectConfig;

  constructor(options: { client: PgPool | PostgresJsSql | Mysql2Pool | BunSql | any }) {
    const { client } = options;

    // Detect if it's a Postgres or MySQL client to use the correct dialect
    // GrepTimeDB supports both protocols.
    let dialect: SqlDialect;

    // Check for Postgres methods
    if (
      typeof client.query === "function" ||
      (typeof client.unsafe === "function" && typeof client.begin === "function")
    ) {
      dialect = new PostgresDialect({ client, config: GrepTimePostgresDialectConfig });
    }
    // Check for MySQL methods
    else if (
      typeof client.execute === "function" ||
      (typeof client.unsafe === "function" && typeof client.transaction === "function")
    ) {
      // Note: BunSql could be either, but since we are in GrepTime context,
      // we check for transaction/begin differences.
      // Most GrepTime users use the Postgres protocol.
      dialect = new MysqlDialect({ client, config: GrepTimeMySQLDialectConfig });
    } else {
      throw new Error("Unsupported GrepTimeDB client protocol");
    }

    this.executor = dialect.executor;
    this.config = dialect.config;
  }
}
