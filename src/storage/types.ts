export type GenericData = Record<string, unknown>;

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

type IsPlainObject<T> = T extends object
  ? T extends any[]
    ? false
    : T extends Date
      ? false
      : true
  : false;

export type ResourceWhere<T> = {
  [K in keyof T]?: IsPlainObject<NonNullable<T[K]>> extends true
    ?
        | WhereOperator<T[K]>
        | {
            [NestedKey in keyof NonNullable<T[K]>]?: WhereOperator<NonNullable<T[K]>[NestedKey]>;
          }
    : WhereOperator<T[K]>;
};

export type SortOrder = "asc" | "desc";

export interface StorageQueryOptions<T = Record<string, any>> {
  limit?: number;
  after?: string;
  orderBy?: Record<string, SortOrder>;
  where?: ResourceWhere<T>;
}

export interface ColumnSchema {
  type: string;
  skippingIndex?: boolean;
}

export interface TableMetadata {
  $primaryKey?: string[];
  $partitionBy?: string[];
  $memoryLimit?: number;
  $indexes?: string[][];
}

/**
 * Schema for a single table.
 * Mixes ColumnSchema definitions with optional $ metadata.
 */
export type TableSchema = {
  [columnName: string]: ColumnSchema | any;
} & TableMetadata;

/**
 * Collection of TableSchema objects (the whole database).
 */
export type DatabaseSchema = Record<string, TableSchema>;

export type StorageOperation = "create" | "update" | "delete" | "findMany" | "findFirst";

export interface StorageExtensionContext<TArgs = any, TResult = any> {
  model: string;
  operation: StorageOperation;
  args: TArgs;
  context: any; // Internal gateway context
  query: (args: TArgs) => Promise<TResult>;
}

export type StorageExtensionCallback<TArgs = any, TResult = any> = (
  params: StorageExtensionContext<TArgs, TResult>,
) => Promise<TResult>;

export interface StorageExtension<TSchema extends DatabaseSchema = any> {
  name?: string;
  query?: {
    [K in keyof TSchema | "$allModels"]?: {
      [Op in StorageOperation | "$allOperations"]?: StorageExtensionCallback;
    };
  };
}

export type RowMapper<T> = (row: any) => T;

/**
 * Fluent client for a specific table. Methods are resource-agnostic.
 */
export interface TableClient<T = any, TExtra = any> {
  findMany(
    options: StorageQueryOptions<TExtra>,
    context?: any,
    mapper?: RowMapper<T>,
    tx?: any,
  ): Promise<T[]>;
  findFirst(
    criteria: Record<string, unknown>,
    context?: any,
    mapper?: RowMapper<T>,
    options?: { orderBy?: Record<string, SortOrder> },
    tx?: any,
  ): Promise<T | undefined>;
  create(data: Record<string, unknown>, context?: any, tx?: any): Promise<{ changes: number }>;
  update(
    id: string,
    data: Record<string, unknown>,
    context?: any,
    tx?: any,
  ): Promise<{ changes: number }>;
  delete(criteria: Record<string, unknown>, context?: any, tx?: any): Promise<{ changes: number }>;
}

/**
 * Main Storage interface, supporting fluent table access via mapped types.
 */
export type Storage<
  TSchema extends DatabaseSchema = any,
  TExtra = Record<string, any>,
> = {
  [K in keyof TSchema]: TableClient<any, TExtra>;
} & {
  migrate(
    schema: TSchema,
    additionalFields?: Record<string, Record<string, { type: string }>>,
  ): Promise<void>;

  // Internal/Generic methods (remain for engine implementation and extension dispatcher)
  _findMany<T>(
    resource: string,
    options: StorageQueryOptions<TExtra>,
    context?: any,
    mapper?: RowMapper<T>,
    table?: string,
    tx?: any,
  ): Promise<T[]>;

  _findFirst<T>(
    resource: string,
    criteria: Record<string, unknown>,
    context?: any,
    mapper?: RowMapper<T>,
    options?: { orderBy?: Record<string, SortOrder> },
    table?: string,
    tx?: any,
  ): Promise<T | undefined>;

  _create(
    resource: string,
    data: Record<string, unknown>,
    context?: any,
    table?: string,
    tx?: any,
  ): Promise<{ changes: number }>;

  _update(
    resource: string,
    id: string,
    data: Record<string, unknown>,
    context?: any,
    table?: string,
    tx?: any,
  ): Promise<{ changes: number }>;

  _delete(
    resource: string,
    criteria: Record<string, unknown>,
    context?: any,
    table?: string,
    tx?: any,
  ): Promise<{ changes: number }>;

  transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>;

  $extends(extension: StorageExtension<TSchema>): this;
};
