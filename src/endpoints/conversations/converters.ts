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
  const item = entity as unknown as ConversationItem;
  item.object = "conversation.item";
  item.created_at = Math.floor(entity.created_at / 1000);

  return item;
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
