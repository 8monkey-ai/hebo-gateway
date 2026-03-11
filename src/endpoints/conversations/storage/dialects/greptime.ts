import type { SQL as BunSql } from "bun";

import {
  PostgresDialect,
  PostgresDialectConfig,
  type PgPool,
  type PostgresJsSql,
} from "./postgres";
import { type DialectConfig, type QueryExecutor, type SqlDialect } from "./types";
import { createParamsMapper, dateToBigInt, jsonStringify } from "./utils";

const GrepTimeBase: Pick<DialectConfig, "types"> = {
  types: {
    varchar: "VARCHAR",
    json: "JSON",
    timestamp: "TIMESTAMP",
    index: "TIME",
  },
};

export const GrepTimeDialectConfig: DialectConfig = Object.assign(
  {},
  PostgresDialectConfig,
  GrepTimeBase,
  {
    jsonExtract: (c: string, k: string) => `json_get_string(${c}, '${k}')`,
    upsertSuffix: undefined,
    supportCreateIndexIfNotExists: true,

    limitAsLiteral: true,
    partitionClause: (cols: string[]) => {
      const col = cols[0];
      return (
        `PARTITION ON COLUMNS (${col}) (` +
        `${col} < '4', ` +
        `${col} >= '4' AND ${col} < '8', ` +
        `${col} >= '8' AND ${col} < 'c', ` +
        `${col} >= 'c')`
      );
    },
    types: GrepTimeBase.types,
  },
);

const mapParams = createParamsMapper([dateToBigInt, jsonStringify]);

function createGreptimeExecutor(base: QueryExecutor): QueryExecutor {
  return {
    all: (sql, params) => base.all(sql, mapParams(params)),
    get: (sql, params) => base.get(sql, mapParams(params)),
    run: (sql, params) => base.run(sql, mapParams(params)),
    transaction: (fn) => base.transaction((tx) => fn(createGreptimeExecutor(tx))),
  };
}

export class GrepTimeDialect implements SqlDialect {
  readonly executor: QueryExecutor;
  readonly config: DialectConfig = GrepTimeDialectConfig;

  constructor(options: { client: PgPool | PostgresJsSql | BunSql }) {
    const { client } = options;
    const dialect = new PostgresDialect({ client, config: this.config });
    this.executor = createGreptimeExecutor(dialect.executor);
  }
}
