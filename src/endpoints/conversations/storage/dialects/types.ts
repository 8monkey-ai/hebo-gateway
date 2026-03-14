export interface QueryExecutor {
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  transaction<T>(fn: (executor: QueryExecutor) => Promise<T>): Promise<T>;
}

export interface DialectConfig {
  placeholder: (index: number) => string;
  quote: (name: string) => string;
  selectJson: (column: string) => string;
  jsonExtract: (column: string, key: string) => string;
  upsertSuffix?: (q: (n: string) => string, pk: string[], updateCols: string[]) => string;

  supportCreateIndexIfNotExists?: boolean;
  limitAsLiteral?: boolean;
  partitionClause?: (columns: string[]) => string;
  types: {
    varchar: string;
    json: string;
    timestamp: string;
    index: "BRIN" | "B-TREE" | "TIME";
  };
}

export interface SqlDialect {
  executor: QueryExecutor;
  config: DialectConfig;
}
