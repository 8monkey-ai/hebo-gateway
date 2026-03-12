import type { SQL as BunSql } from "bun";

import {
  PostgresDialect,
  PostgresDialectConfig,
  type PgPool,
  type PostgresJsSql,
  isBunSql,
  isPgPool,
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

const pad = (n: number, l = 2) => n.toString().padStart(l, "0");

function dateToGreptimeString(v: unknown) {
  if (v instanceof Date) {
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())} ${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}:${pad(v.getUTCSeconds())}.${pad(v.getUTCMilliseconds(), 3)}`;
  }
  return v;
}

// GreptimeDB is strictly typed over the Postgres wire protocol, and each driver
// coerces JavaScript types differently. There is no unified parameter format:
//
// 1. Timestamps:
//    - `pg` requires a strictly formatted string (YYYY-MM-DD HH:mm:ss.SSS). It fails on BigInt.
//    - `postgresjs` requires a BigInt (milliseconds). It parses strings into ISO formats which GreptimeDB rejects.
//    - `Bun.SQL` is flexible, but we use BigInt for consistency with postgresjs.
//
// 2. JSON:
//    - GreptimeDB rejects plain strings for JSON, expecting a bytea-compatible format.
//    - `pg` and `Bun.SQL` require the JSON string to be wrapped in a Buffer.
//    - `postgresjs` works with plain JSON strings.
const mapParams = createParamsMapper([dateToBigInt, (v) => jsonStringify(v)]);
const mapParamsBun = createParamsMapper([dateToBigInt, (v) => jsonStringify(v, true)]);
const mapParamsPg = createParamsMapper([dateToGreptimeString, (v) => jsonStringify(v, true)]);

export class GrepTimeDialect implements SqlDialect {
  readonly executor: QueryExecutor;
  readonly config: DialectConfig = GrepTimeDialectConfig;

  constructor(options: { client: PgPool | PostgresJsSql | BunSql }) {
    const { client } = options;
    const dialect = new PostgresDialect({
      client,
      config: this.config,
      mapParams: isPgPool(client) ? mapParamsPg : isBunSql(client) ? mapParamsBun : mapParams,
    });
    this.executor = dialect.executor;
  }
}
