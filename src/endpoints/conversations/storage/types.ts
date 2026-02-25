import type { Conversation, ConversationItem } from "../schema";

export interface ListItemsParams {
  limit?: number;
  order?: "asc" | "desc";
  after?: string;
}

export interface ConversationStorage {
  createConversation(conversation: Conversation): Promise<Conversation>;

  getConversation(id: string): Promise<Conversation | undefined>;

  updateConversation(conversation: Conversation): Promise<Conversation>;

  deleteConversation(id: string): Promise<{ id: string; deleted: boolean }>;

  addItems(conversationId: string, items: ConversationItem[]): Promise<ConversationItem[]>;

  getItem(conversationId: string, itemId: string): Promise<ConversationItem | undefined>;

  deleteItem(conversationId: string, itemId: string): Promise<{ id: string; deleted: boolean }>;

  listItems(conversationId: string, params?: ListItemsParams): Promise<ConversationItem[]>;
}
