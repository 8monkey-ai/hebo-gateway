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
  const item: Record<string, unknown> = {};

  for (const key in entity) {
    if (key === "conversation_id") continue;
    if (key === "created_at") {
      item["created_at"] = Math.floor(entity["created_at"] / 1000);
      continue;
    }
    item[key] = entity[key as keyof typeof entity];
  }

  item["object"] = "conversation.item";

  return item as unknown as ConversationItem;
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
