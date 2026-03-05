import type { Conversation, ConversationItem, Metadata, ResponseInputItem } from "./schema";

/**
 * Creates a new Conversation object with generated ID and timestamp.
 */
export function createConversation(params: { metadata?: Metadata }): Conversation {
  return {
    id: crypto.randomUUID(),
    object: "conversation",
    created_at: Math.floor(Date.now() / 1000),
    metadata: params.metadata ?? null,
  };
}

/**
 * Creates a new ConversationItem object from input data with generated ID and timestamp.
 */
export function createConversationItem(input: ResponseInputItem): ConversationItem {
  const item = input as ConversationItem;
  item.id ??= crypto.randomUUID();
  item.object = "conversation.item";
  item.created_at = Math.floor(Date.now() / 1000);
  return item;
}
