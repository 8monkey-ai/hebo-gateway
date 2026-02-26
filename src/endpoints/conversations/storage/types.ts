import type { Conversation, ConversationItem } from "../schema";

export interface ListItemsParams {
  limit?: number;
  order?: "asc" | "desc";
  after?: string;
}

export interface ConversationStorage {
  createConversation(conversation: Conversation, items?: ConversationItem[]): Promise<Conversation>;

  getConversation(id: string): Promise<Conversation | undefined>;

  updateConversation(id: string, metadata: Record<string, any>): Promise<Conversation | undefined>;

  deleteConversation(id: string): Promise<{ id: string; deleted: boolean }>;

  addItems(conversationId: string, items: ConversationItem[]): Promise<ConversationItem[]>;

  getItem(conversationId: string, itemId: string): Promise<ConversationItem | undefined>;

  deleteItem(conversationId: string, itemId: string): Promise<Conversation | undefined>;

  listItems(conversationId: string, params?: ListItemsParams): Promise<ConversationItem[]>;
}
