import type { ConversationDeleted } from "./schema";

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
