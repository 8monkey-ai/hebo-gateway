/**
 * Standard comparison operators for query filtering.
 * @example { gt: 5, lt: 20 }, { in: ["active", "pending"] }, { contains: "search_term" }
 */
export type WhereOperator<T> =
  | T
  | {
      eq?: T;
      ne?: T;
      gt?: T;
      gte?: T;
      lt?: T;
      lte?: T;
      in?: T[];
      contains?: string;
      isNull?: boolean;
    };

/**
 * Internal utility to check if a type is a plain object suitable for nested filtering.
 */
type IsPlainObject<T> = T extends object
  ? T extends unknown[]
    ? false
    : T extends Date
      ? false
      : true
  : false;

/**
 * Recursive type-safe query builder. Supports dot-notation for nested JSON.
 * @example { "metadata.user_id": "user_1" }, { count: { gte: 10 } }
 */
export type WhereCondition<T> = {
  [K in keyof T]?: IsPlainObject<NonNullable<T[K]>> extends true
    ?
        | WhereOperator<T[K]>
        | {
            [NestedKey in keyof NonNullable<T[K]>]?: WhereOperator<NonNullable<T[K]>[NestedKey]>;
          }
    : WhereOperator<T[K]>;
};

export type SortOrder = "asc" | "desc";

/**
 * Tailored data retrieval parameters.
 * @example { limit: 10, orderBy: { created_at: "desc" }, where: { "metadata.tag": "urgent" } }
 */
export interface StorageQueryOptions<T = Record<string, unknown>> {
  limit?: number;
  after?: string;
  orderBy?: Record<string, SortOrder>;
  where?: WhereCondition<T>;
}

/**
 * Column-level metadata and physical properties.
 * @example { type: "id" }, { type: "json", skippingIndex: true }
 */
export interface ColumnSchema {
  type: string;
  skippingIndex?: boolean;
  index?: boolean;
  primaryKey?: boolean;
}

/**
 * Table-level configuration and high-level structural properties.
 * @example { $primaryKey: ["conv_id", "id"], $memoryLimit: 5000 }
 */
export interface TableMetadata {
  $primaryKey?: string[];
  $partitionBy?: string[];
  $memoryLimit?: number;
  $indexes?: string[][];
}

export type TableSchema = {
  [columnName: string]: unknown;
} & TableMetadata;

export type DatabaseSchema = Record<string, TableSchema>;

export type StorageOperation = "create" | "update" | "delete" | "findMany" | "findFirst";

/**
 * State passed to query interception hooks.
 * @example const { model, args, query } = context;
 */
export interface StorageExtensionContext<TArgs = unknown, TResult = unknown> {
  model: string;
  operation: StorageOperation;
  args: TArgs;
  context: unknown;
  tx?: unknown;
  query: (args: TArgs, tx?: unknown) => Promise<TResult>;
}

/**
 * Signature for storage interceptors.
 */
export type StorageExtensionCallback<TArgs = unknown, TResult = unknown> = (
  params: StorageExtensionContext<TArgs, TResult>,
) => Promise<TResult>;

/**
 * Standard API for interacting with a specific table.
 * @example await storage.users.findFirst({ where: { id: "123" } })
 */
export interface TableClient<T = unknown, TExtra = unknown> {
  findMany(
    options: StorageQueryOptions<TExtra>,
    context?: unknown,
    mapper?: RowMapper<T>,
    tx?: unknown,
  ): Promise<T[]>;
  findFirst(
    where: WhereCondition<TExtra>,
    context?: unknown,
    mapper?: RowMapper<T>,
    options?: { orderBy?: Record<string, SortOrder> },
    tx?: unknown,
  ): Promise<T | undefined>;
  create(
    data: Record<string, unknown>,
    context?: unknown,
    tx?: unknown,
  ): Promise<{ id: string } & Record<string, unknown>>;
  update(
    id: string,
    data: Record<string, unknown>,
    context?: unknown,
    tx?: unknown,
  ): Promise<{ changes: number }>;
  delete(
    where: WhereCondition<TExtra>,
    context?: unknown,
    tx?: unknown,
  ): Promise<{ changes: number }>;
}

export type DatabaseClient = Record<string, TableClient>;

/**
 * Defines modular logic to augment the storage system.
 * @example { query: { conversations: { create: ({ args }) => ... } } }
 */
export interface StorageExtension<TSchema extends DatabaseClient = DatabaseClient> {
  name?: string;
  schema?: DatabaseSchema;
  query?: {
    [K in keyof TSchema | "$allModels"]?: {
      [Op in StorageOperation | "$allOperations"]?: StorageExtensionCallback;
    };
  };
  model?: {
    [K in keyof TSchema | "$allModels"]?: Record<
      string,
      (this: TableClient, ...args: unknown[]) => unknown
    >;
  };
  client?: Record<string, (this: StorageClient<TSchema>, ...args: unknown[]) => unknown>;
}

/**
 * Factory for initializing a storage extension.
 * @example (client) => ({ name: "logger", query: { ... } })
 */
export type StorageExtensionFactory<TSchema extends DatabaseClient = DatabaseClient> = (
  client: StorageClient,
) => StorageExtension<TSchema>;

export type RowMapper<T> = (row: Record<string, unknown>) => T;

/**
 * High-level, fluent interface for storage access.
 * @example const storage = new SqlStorage(...).$extends(conversationExtension);
 */
export type StorageClient<TSchema extends DatabaseClient = DatabaseClient> = StorageBase<TSchema> &
  TSchema;

/**
 * Internal interface for provider-specific storage implementations.
 */
export interface StorageBase<TSchema extends DatabaseClient = DatabaseClient> {
  readonly dialect?: unknown;
  readonly schema?: DatabaseSchema;

  migrate(): Promise<void>;

  _findMany<T>(
    model: string,
    options: StorageQueryOptions<unknown>,
    context?: unknown,
    table?: string,
    tx?: unknown,
    mapper?: RowMapper<T>,
  ): Promise<T[]>;

  _findFirst<T>(
    model: string,
    where: WhereCondition<unknown>,
    context?: unknown,
    table?: string,
    tx?: unknown,
    mapper?: RowMapper<T>,
    options?: { orderBy?: Record<string, SortOrder> },
  ): Promise<T | undefined>;

  _create(
    model: string,
    data: Record<string, unknown>,
    context?: unknown,
    table?: string,
    tx?: unknown,
  ): Promise<{ id: string } & Record<string, unknown>>;

  _update(
    model: string,
    args: { id: string; data: Record<string, unknown> },
    context?: unknown,
    table?: string,
    tx?: unknown,
  ): Promise<{ changes: number }>;

  _delete(
    model: string,
    where: WhereCondition<unknown>,
    context?: unknown,
    table?: string,
    tx?: unknown,
  ): Promise<{ changes: number }>;

  transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T>;

  /**
   * Extends the storage with domain logic and new tables.
   */
  $extends<TNewSchema extends DatabaseClient>(
    extension: StorageExtension<TNewSchema> | StorageExtensionFactory<TNewSchema>,
  ): StorageClient<TSchema & TNewSchema>;
}
