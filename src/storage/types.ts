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

export interface StorageQueryOptions<T = Record<string, any>> {
  limit?: number;
  after?: string;
  orderBy?: string;
  where?: ResourceWhere<T>;
}

export interface ColumnSchema {
  type: string;
  skippingIndex?: boolean;
}

export interface TableSchema {
  [tableName: string]: {
    [columnName: string]: ColumnSchema;
  } & {
    $primaryKey?: string[];
    $partitionBy?: string[];
    $memoryLimit?: number;
    $indexes?: string[][];
  };
}

export type StorageOperation = "create" | "update" | "delete" | "list" | "get";

export interface StorageHookParams<TArgs, TResult> {
  operation: StorageOperation;
  args: TArgs;
  context: any;
  table: string;
  query: (args: TArgs, options?: { table?: string; tx?: any }) => Promise<TResult>;
}

export type StorageHook<TArgs, TResult> = (
  params: StorageHookParams<TArgs, TResult>,
) => Promise<TResult>;

export interface StorageExtensions<TExtra = Record<string, any>> {
  hooks?: {
    [resource: string]: {
      [operation in StorageOperation]?: StorageHook<any, any>;
    };
  };
}

export type RowMapper<T> = (row: any) => T;

export interface Storage<TExtra = Record<string, any>> {
  migrate(
    schema: TableSchema,
    additionalFields?: Record<string, Record<string, { type: string }>>,
  ): Promise<void>;

  find<T>(
    resource: string,
    options: StorageQueryOptions<TExtra>,
    context?: any,
    mapper?: RowMapper<T>,
    table?: string,
    tx?: any,
  ): Promise<T[]>;

  findOne<T>(
    resource: string,
    criteria: Record<string, unknown>,
    context?: any,
    mapper?: RowMapper<T>,
    options?: { orderBy?: string },
    table?: string,
    tx?: any,
  ): Promise<T | undefined>;

  insert(
    resource: string,
    data: Record<string, unknown>,
    context?: any,
    table?: string,
    tx?: any,
  ): Promise<{ changes: number }>;

  update(
    resource: string,
    id: string,
    data: Record<string, unknown>,
    context?: any,
    table?: string,
    tx?: any,
  ): Promise<{ changes: number }>;

  remove(
    resource: string,
    criteria: Record<string, unknown>,
    context?: any,
    table?: string,
    tx?: any,
  ): Promise<{ changes: number }>;

  transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>;

  $extends(extension: StorageExtensions<TExtra>): this;
}
