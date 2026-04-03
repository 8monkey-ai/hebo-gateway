import {
  PostgresDialect,
  PostgresDialectConfig,
  type PgPool,
  type PostgresJsSql,
  isBunSql,
  isPgPool,
} from "./postgres";
import { type BunSql, type DialectConfig, type QueryExecutor, type SqlDialect } from "./types";
import { createParamsMapper, dateToBigInt, escapeSqlString, jsonStringify } from "./utils";

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
    /**
     * GreptimeDB has a bug where it can return invalid JSON strings
     * containing Rust-style Unicode escapes like \u{xxxx} instead of standard JSON escapes \uxxxx.
     * https://github.com/GreptimeTeam/greptimedb/issues/7808
     *
     * To prevent the Postgres drivers (postgresjs, pg, bun:sql) from crashing when they attempt
     * to auto-parse this invalid JSON, we cast the JSON column to a raw STRING on the wire.
     *
     * Our storage layer then manually normalizes these Rust escapes before calling JSON.parse().
     * See: src/endpoints/conversations/storage/dialects/utils.ts -> normalizeJsonUnicodeEscapes
     */
    selectJson: (c: string) => `${c}::STRING`,
    jsonExtract: (c: string, k: string) => `json_get_string(${c}, '${escapeSqlString(k)}')`,
    upsertSuffix: undefined,
    supportCreateIndexIfNotExists: true,

    limitAsLiteral: true,
    partitionClause: (cols: string[]) => {
      const col = cols[0];
      return (
        `PARTITION ON COLUMNS (${col}) (` +
        `${col} < '1', ` +
        `${col} >= 'f', ` +
        `${col} >= '1' AND ${col} < '2', ` +
        `${col} >= '2' AND ${col} < '3', ` +
        `${col} >= '3' AND ${col} < '4', ` +
        `${col} >= '4' AND ${col} < '5', ` +
        `${col} >= '5' AND ${col} < '6', ` +
        `${col} >= '6' AND ${col} < '7', ` +
        `${col} >= '7' AND ${col} < '8', ` +
        `${col} >= '8' AND ${col} < '9', ` +
        `${col} >= '9' AND ${col} < 'a', ` +
        `${col} >= 'a' AND ${col} < 'b', ` +
        `${col} >= 'b' AND ${col} < 'c', ` +
        `${col} >= 'c' AND ${col} < 'd', ` +
        `${col} >= 'd' AND ${col} < 'e', ` +
        `${col} >= 'e' AND ${col} < 'f')`
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
//    - `pg` requires a strictly formatted string (YYYY-MM-DD HH:mm:ss.SSS).
//      It fails on BigInt.
//    - `postgresjs` requires a BigInt (milliseconds). It parses strings into ISO
//       formats which GreptimeDB rejects.
//    - `Bun.SQL` is flexible, but we use BigInt for consistency with postgresjs.
//
// 2. JSON:
//    - GreptimeDB rejects plain strings for JSON, expecting a bytea-compatible format.
//    - `pg` and `Bun.SQL` require the JSON string to be wrapped in a Uint8Array (binary).
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
