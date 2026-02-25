import type { Conversation, ConversationItem, ConversationItemInput } from "../schema";

export interface ListItemsParams {
  limit?: number;
  order?: "asc" | "desc";
  after?: string;
}

export interface ConversationStorage {
  createConversation(params: {
    items?: ConversationItemInput[];
    metadata?: Record<string, unknown>;
  }): Promise<Conversation>;

  getConversation(id: string): Promise<Conversation | undefined>;

  updateConversation(
    id: string,
    params: { metadata: Record<string, unknown> },
  ): Promise<Conversation>;

  deleteConversation(id: string): Promise<{ id: string; deleted: boolean }>;

  addItems(conversationId: string, items: ConversationItemInput[]): Promise<ConversationItem[]>;

  getItem(conversationId: string, itemId: string): Promise<ConversationItem | undefined>;

  deleteItem(conversationId: string, itemId: string): Promise<{ id: string; deleted: boolean }>;

  listItems(conversationId: string, params?: ListItemsParams): Promise<ConversationItem[]>;
}
