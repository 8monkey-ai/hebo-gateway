import type { Conversation, ConversationItem, ConversationDeleted } from "./schema";
import type { ConversationEntity, ConversationItemEntity } from "./storage/types";

export function toConversation(entity: ConversationEntity): Conversation {
  return {
    id: entity.id,
    object: "conversation",
    created_at: Math.floor(entity.created_at / 1000),
    metadata: entity.metadata,
  };
}

export function toConversationItem(entity: ConversationItemEntity): ConversationItem {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { conversation_id, created_at, ...rest } = entity;
  return {
    ...rest,
    object: "conversation.item",
    created_at: Math.floor(created_at / 1000),
  } as ConversationItem;
}

export function toConversationDeleted(result: {
  id: string;
  deleted: boolean;
}): ConversationDeleted {
  return {
    id: result.id,
    deleted: result.deleted,
    object: "conversation.deleted",
  };
}
