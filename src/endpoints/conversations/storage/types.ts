export type ConversationMetadata = Record<string, string> | null;

export interface ConversationEntity {
  id: string;
  created_at: number;
  metadata: ConversationMetadata;
}

export type ConversationEntityWithExtra<TExtra> = ConversationEntity & TExtra;

export interface ConversationItemInput {
  id?: string;
  type: string;
  [key: string]: unknown;
}

export interface ConversationItemEntity extends ConversationItemInput {
  id: string;
  conversation_id: string;
  created_at: number;
}

export type ConversationItemEntityWithExtra<TExtra> = ConversationItemEntity & TExtra;

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

// Helper type to check if T is a plain object/record (but not an array or null)
type IsPlainObject<T> = T extends object
  ? T extends any[]
    ? false
    : T extends Date
      ? false
      : true
  : false;

// If the property is an object (like metadata: Record<string, string>), allow:
// 1. Checking the whole object (WhereOperator<T[K]>)
// 2. Checking specific keys inside the object (Record<string, WhereOperator<ValueType>>)
export type WhereClause<T> = {
  [K in keyof T]?: IsPlainObject<NonNullable<T[K]>> extends true
    ?
        | WhereOperator<T[K]>
        | {
            [NestedKey in keyof NonNullable<T[K]>]?: WhereOperator<NonNullable<T[K]>[NestedKey]>;
          }
    : WhereOperator<T[K]>;
};

export interface ConversationQueryOptions<TExtra = Record<string, any>> {
  limit?: number;
  after?: string;
  order?: "asc" | "desc";
  where?: WhereClause<
    ConversationEntityWithExtra<TExtra> | ConversationItemEntityWithExtra<TExtra>
  >;
}

export interface ColumnSchema {
  type: string;
  index?: boolean | "B-TREE" | "BRIN" | "TIME";
  partition?: boolean; // GreptimeDB specific
  default?: string;
  nullable?: boolean;
}

export interface TableSchema {
  conversations?: Record<string, ColumnSchema>;
  conversation_items?: Record<string, ColumnSchema>;
}

export type StorageOperation = "create" | "update" | "delete" | "list" | "get";

export interface StorageHookParams<TArgs, TResult> {
  operation: StorageOperation;
  args: TArgs;
  context: any;
  table: string;
  query: (args: TArgs, options?: { table?: string }) => Promise<TResult>;
}

export type StorageHook<TArgs, TResult> = (
  params: StorageHookParams<TArgs, TResult>,
) => Promise<TResult>;

// Strict type mappings for Conversations
export interface ConversationHooks<TExtra = Record<string, any>> {
  create?: StorageHook<
    { metadata?: ConversationMetadata; items?: ConversationItemInput[] } & Partial<TExtra>,
    ConversationEntityWithExtra<TExtra>
  >;
  get?: StorageHook<{ id: string }, ConversationEntityWithExtra<TExtra> | undefined>;
  list?: StorageHook<ConversationQueryOptions<TExtra>, ConversationEntityWithExtra<TExtra>[]>;
  update?: StorageHook<
    { id: string; params: { metadata?: ConversationMetadata } & Partial<TExtra> },
    ConversationEntityWithExtra<TExtra> | undefined
  >;
  delete?: StorageHook<{ id: string }, { id: string; deleted: boolean }>;
}

// Strict type mappings for Items
export interface ItemHooks<TExtra = Record<string, any>> {
  create?: StorageHook<
    { conversationId: string; items: ConversationItemInput[] },
    ConversationItemEntityWithExtra<TExtra>[] | undefined
  >;
  get?: StorageHook<
    { conversationId: string; itemId: string },
    ConversationItemEntityWithExtra<TExtra> | undefined
  >;
  list?: StorageHook<
    { conversationId: string } & ConversationQueryOptions<TExtra>,
    ConversationItemEntityWithExtra<TExtra>[] | undefined
  >;
  delete?: StorageHook<
    { conversationId: string; itemId: string },
    ConversationEntityWithExtra<TExtra> | undefined
  >;
}

export interface StorageExtensions<TExtra = Record<string, any>> {
  query?: {
    conversations?: ConversationHooks<TExtra>;
    conversation_items?: ItemHooks<TExtra>;
  };
}

export interface ConversationStorage<TExtra = Record<string, any>> {
  createConversation(
    params: {
      metadata?: ConversationMetadata;
      items?: ConversationItemInput[];
    } & Partial<TExtra>,
    context?: any,
  ): Promise<ConversationEntityWithExtra<TExtra>>;

  getConversation(
    id: string,
    context?: any,
  ): Promise<ConversationEntityWithExtra<TExtra> | undefined>;

  listConversations(
    params: ConversationQueryOptions<TExtra>,
    context?: any,
  ): Promise<ConversationEntityWithExtra<TExtra>[]>;

  updateConversation(
    id: string,
    params: { metadata?: ConversationMetadata } & Partial<TExtra>,
    context?: any,
  ): Promise<ConversationEntityWithExtra<TExtra> | undefined>;

  deleteConversation(id: string, context?: any): Promise<{ id: string; deleted: boolean }>;

  addItems(
    conversationId: string,
    items: ConversationItemInput[],
    context?: any,
  ): Promise<ConversationItemEntityWithExtra<TExtra>[] | undefined>;

  getItem(
    conversationId: string,
    itemId: string,
    context?: any,
  ): Promise<ConversationItemEntityWithExtra<TExtra> | undefined>;

  deleteItem(
    conversationId: string,
    itemId: string,
    context?: any,
  ): Promise<ConversationEntityWithExtra<TExtra> | undefined>;

  listItems(
    conversationId: string,
    params: ConversationQueryOptions<TExtra>,
    context?: any,
  ): Promise<ConversationItemEntityWithExtra<TExtra>[] | undefined>;

  $extends(extension: StorageExtensions): this;
}
