export type ConversationMetadata = Record<string, string> | null;

export interface ConversationEntity {
  id: string;
  created_at: number;
  metadata: ConversationMetadata;
}

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

export interface ConversationQueryOptions {
  limit: number;
  after?: string;
  order?: "asc" | "desc";
  metadata?: ConversationMetadata;
}

export interface ConversationStorage {
  createConversation(
    params: {
      metadata?: ConversationMetadata;
      items?: ConversationItemInput[];
    },
    executor?: unknown,
  ): Promise<ConversationEntity>;

  getConversation(id: string): Promise<ConversationEntity | undefined>;

  listConversations(params: ConversationQueryOptions): Promise<ConversationEntity[]>;

  updateConversation(
    id: string,
    metadata: ConversationMetadata,
  ): Promise<ConversationEntity | undefined>;

  deleteConversation(id: string): Promise<{ id: string; deleted: boolean }>;

  addItems(
    conversationId: string,
    items: ConversationItemInput[],
  ): Promise<ConversationItemEntity[] | undefined>;

  getItem(conversationId: string, itemId: string): Promise<ConversationItemEntity | undefined>;

  deleteItem(conversationId: string, itemId: string): Promise<ConversationEntity | undefined>;

  listItems(
    conversationId: string,
    params: ConversationQueryOptions,
  ): Promise<ConversationItemEntity[] | undefined>;
}
