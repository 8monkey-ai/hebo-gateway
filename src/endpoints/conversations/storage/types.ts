import type { Conversation, ConversationItem, ConversationItemListParams } from "../schema";

export interface ConversationStorage {
  createConversation(conversation: Conversation, items?: ConversationItem[]): Promise<Conversation>;

  getConversation(id: string): Promise<Conversation | undefined>;

  updateConversation(
    id: string,
    metadata: Record<string, unknown>,
  ): Promise<Conversation | undefined>;

  deleteConversation(id: string): Promise<{ id: string; deleted: boolean }>;

  addItems(conversationId: string, items: ConversationItem[]): Promise<ConversationItem[]>;

  getItem(conversationId: string, itemId: string): Promise<ConversationItem | undefined>;

  deleteItem(conversationId: string, itemId: string): Promise<Conversation | undefined>;

  listItems(
    conversationId: string,
    params?: ConversationItemListParams,
  ): Promise<ConversationItem[]>;
}
