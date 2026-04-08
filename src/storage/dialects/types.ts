/**
 * Lightweight interface for Bun's SQL client.
 *
 * We define this locally instead of importing from "bun" to avoid leaking Bun-only
 * types in our public API. This prevents TypeScript compilation errors for users
 * who are not using Bun and don't have @types/bun installed.
 *
 * Because TypeScript uses structural typing, a real Bun SQL instance will still
 * match this interface perfectly.
 */
export interface BunSql {
  unsafe<T = unknown>(query: string, params?: unknown[]): Promise<T>;
  transaction<T>(fn: (tx: BunSql) => Promise<T>): Promise<T>;
}

export interface QueryExecutor {
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  transaction<T>(fn: (executor: QueryExecutor) => Promise<T>): Promise<T>;
}

export type LogicalType =
  | "id"
  | "string"
  | "shorttext"
  | "longtext"
  | "int"
  | "timestamp"
  | "json"
  | "boolean";

export interface DialectConfig {
  placeholder: (index: number) => string;
  quote: (name: string) => string;
  selectJson: (column: string) => string;
  jsonExtract: (column: string, key: string) => string;
  upsertSuffix?: (q: (n: string) => string, pk: string[], updateCols: string[]) => string;

  supportCreateIndexIfNotExists?: boolean;
  limitAsLiteral?: boolean;
  partitionClause?: (columns: string[]) => string;
  types: Record<LogicalType, string> & {
    index: "BRIN" | "B-TREE" | "TIME";
  };
}

export interface SqlDialect {
  executor: QueryExecutor;
  config: DialectConfig;
}
