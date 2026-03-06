import type {
  Conversation,
  ConversationItem,
  ConversationItemListParams,
  Metadata,
  ResponseInputItem,
} from "../schema";

export interface ConversationStorage {
  createConversation(params: {
    metadata?: Metadata;
    items?: ResponseInputItem[];
  }): Promise<Conversation>;

  getConversation(id: string): Promise<Conversation | undefined>;

  updateConversation(id: string, metadata: Metadata): Promise<Conversation | undefined>;

  deleteConversation(id: string): Promise<{ id: string; deleted: boolean }>;

  addItems(
    conversationId: string,
    items: ResponseInputItem[],
  ): Promise<ConversationItem[] | undefined>;

  getItem(conversationId: string, itemId: string): Promise<ConversationItem | undefined>;

  deleteItem(conversationId: string, itemId: string): Promise<Conversation | undefined>;

  listItems(
    conversationId: string,
    params: ConversationItemListParams,
  ): Promise<ConversationItem[] | undefined>;
}
