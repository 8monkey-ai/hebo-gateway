export type StoredItem = {
  type: string;
  [key: string]: any;
};

export type ConversationItem = {
  id: string;
  object: "conversation.item";
  created_at: number;
  data: StoredItem;
  metadata?: Record<string, unknown>;
};

export type Conversation = {
  id: string;
  object: "conversation";
  created_at: number;
  metadata: Record<string, unknown>;
};

export interface ListItemsParams {
  limit?: number;
  order?: "asc" | "desc";
  after?: string;
}

export interface ConversationStorage {
  createConversation(params: {
    items?: StoredItem[];
    metadata?: Record<string, unknown>;
  }): Promise<Conversation>;

  getConversation(id: string): Promise<Conversation | undefined>;

  updateConversation(
    id: string,
    params: { metadata: Record<string, unknown> },
  ): Promise<Conversation>;

  deleteConversation(id: string): Promise<{ id: string; deleted: boolean }>;

  addItems(conversationId: string, items: StoredItem[]): Promise<ConversationItem[]>;

  getItem(conversationId: string, itemId: string): Promise<ConversationItem | undefined>;

  deleteItem(conversationId: string, itemId: string): Promise<{ id: string; deleted: boolean }>;

  listItems(conversationId: string, params?: ListItemsParams): Promise<ConversationItem[]>;
}
