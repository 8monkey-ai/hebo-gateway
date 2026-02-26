import type { Conversation, ConversationItem, ResponseInputItem } from "./schema";

/**
 * Creates a new Conversation object with generated ID and timestamp.
 */
export function createConversation(params: { metadata?: Record<string, unknown> }): Conversation {
  return {
    id: `conv_${crypto.randomUUID()}`,
    object: "conversation",
    created_at: Math.floor(Date.now() / 1000),
    metadata: params.metadata ?? {},
  };
}

/**
 * Creates a new ConversationItem object from input data with generated ID and timestamp.
 */
export function createConversationItem(input: ResponseInputItem): ConversationItem {
  return {
    id: `item_${crypto.randomUUID()}`,
    object: "conversation.item",
    created_at: Math.floor(Date.now() / 1000),
    ...input,
  };
}
