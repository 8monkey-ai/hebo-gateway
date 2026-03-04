export interface QueryExecutor {
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  transaction<T>(cb: (executor: QueryExecutor) => Promise<T>): Promise<T>;
}

export interface DialectConfig {
  placeholder: (index: number) => string;
  idType: string;
  objectType: string;
  jsonType: string;
  createdAtType: string;
  createIndexSql?: (table: string, name: string, columns: string[]) => string;
}
