import { type SqlDialect } from "./dialects/types";

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

export interface StorageQueryOptions<T = Record<string, any>> {
  limit?: number;
  after?: string;
  orderBy?: Record<string, SortOrder>;
  where?: WhereCondition<T>;
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

export type TableSchema = {
  [columnName: string]: ColumnSchema | string | any;
} & TableMetadata;

export type DatabaseSchema = Record<string, TableSchema>;

export type StorageOperation = "create" | "update" | "delete" | "findMany" | "findFirst";

export interface StorageExtensionContext<TArgs = any, TResult = any> {
  model: string;
  operation: StorageOperation;
  args: TArgs;
  context: any;
  tx?: any;
  query: (args: TArgs, tx?: any) => Promise<TResult>;
}

export type StorageExtensionCallback<TArgs = any, TResult = any> = (
  params: StorageExtensionContext<TArgs, TResult>,
) => Promise<TResult>;

export interface StorageExtension<TSchema extends DatabaseSchema = any> {
  name?: string;
  schema?: DatabaseSchema;
  query?: {
    [K in keyof TSchema | "$allModels"]?: {
      [Op in StorageOperation | "$allOperations"]?: StorageExtensionCallback;
    };
  };
  model?: {
    [K in keyof TSchema | "$allModels"]?: Record<string, (this: any, ...args: any[]) => any>;
  };
  client?: Record<string, (this: any, ...args: any[]) => any>;
}

export type StorageExtensionFactory<TSchema extends DatabaseSchema = any> = (
  client: Storage,
) => StorageExtension<TSchema>;

export type RowMapper<T> = (row: any) => T;

export interface TableClient<T = any, TExtra = any> {
  findMany(
    options: StorageQueryOptions<TExtra>,
    context?: any,
    mapper?: RowMapper<T>,
    tx?: any,
  ): Promise<T[]>;
  findFirst(
    where: WhereCondition<TExtra>,
    context?: any,
    mapper?: RowMapper<T>,
    options?: { orderBy?: Record<string, SortOrder> },
    tx?: any,
  ): Promise<T | undefined>;
  create(data: Record<string, unknown>, context?: any, tx?: any): Promise<any>;
  update(id: string, data: Record<string, unknown>, context?: any, tx?: any): Promise<any>;
  delete(where: WhereCondition<TExtra>, context?: any, tx?: any): Promise<any>;
}

/**
 * Storage is the combination of the Base engine and the dynamically added Tables.
 * This intersection is what allows 'storage.conversations.findMany()'.
 */
export type Storage<TSchema extends Record<string, TableClient<any>> = any> =
  StorageBase<TSchema> & TSchema;

export interface StorageBase<TSchema extends Record<string, TableClient<any>> = any> {
  readonly dialect?: SqlDialect;
  readonly schema?: DatabaseSchema;

  migrate(): Promise<void>;

  _findMany<T>(
    resource: string,
    options: StorageQueryOptions<any>,
    context?: any,
    mapper?: RowMapper<T>,
    table?: string,
    tx?: any,
  ): Promise<T[]>;

  _findFirst<T>(
    resource: string,
    where: WhereCondition<any>,
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
  ): Promise<any>;

  _update(
    resource: string,
    id: string,
    data: Record<string, unknown>,
    context?: any,
    table?: string,
    tx?: any,
  ): Promise<any>;

  _delete(
    resource: string,
    where: WhereCondition<any>,
    context?: any,
    table?: string,
    tx?: any,
  ): Promise<any>;

  transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>;

  /**
   * Extends the storage with new tables and domain expertise.
   * RETURNS: A new Storage type that includes the new tables automatically (Prisma style).
   */
  $extends<TNewSchema extends Record<string, TableClient<any>>>(
    extension: StorageExtension | StorageExtensionFactory,
  ): Storage<TSchema & TNewSchema>;
}
