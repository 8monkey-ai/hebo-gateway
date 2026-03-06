export interface QueryExecutor {
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  transaction<T>(fn: (executor: QueryExecutor) => Promise<T>): Promise<T>;
}

export interface DialectConfig {
  placeholder: (index: number) => string;
  partitioned?: boolean;
  types: {
    varchar: string;
    json: string;
    timestamp: string;
    index: "BRIN" | "B-TREE" | "none";
    timeIndex?: boolean;
  };
}

export interface SqlDialect {
  executor: QueryExecutor;
  config: DialectConfig;
}
