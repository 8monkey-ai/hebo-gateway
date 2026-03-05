export interface QueryExecutor {
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
}

export interface DialectConfig {
  placeholder: (index: number) => string;
  partitioned?: boolean;
  types: {
    varchar: string;
    json: string;
    int64: string;
    index: "BRIN" | "B-TREE" | "none";
    timeIndex?: boolean;
  };
}
