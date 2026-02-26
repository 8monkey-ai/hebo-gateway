import { LRUCache } from "lru-cache";

import type { Conversation, ConversationItem } from "../schema";
import type { ConversationStorage, ListItemsParams } from "./types";

export class InMemoryStorage implements ConversationStorage {
  private conversations = new Map<string, Conversation>();
  private items: LRUCache<string, ConversationItem[]>;

  constructor(options?: { maxSize?: number }) {
    // Default to 256MB
    const maxSize = options?.maxSize ?? 256 * 1024 * 1024;

    this.items = new LRUCache<string, ConversationItem[]>({
      maxSize,
      sizeCalculation: (items) => JSON.stringify(items).length,
      dispose: (_value, key) => {
        this.conversations.delete(key);
      },
    });
  }

  createConversation(
    conversation: Conversation,
    items?: ConversationItem[],
  ): Promise<Conversation> {
    this.conversations.set(conversation.id, conversation);
    this.items.set(conversation.id, items ?? []);
    return Promise.resolve(conversation);
  }

  getConversation(id: string): Promise<Conversation | undefined> {
    // Updates the LRU position
    if (this.items.get(id) === undefined) {
      return Promise.resolve(undefined as Conversation | undefined);
    }
    return Promise.resolve(this.conversations.get(id));
  }

  updateConversation(id: string, metadata: Record<string, any>): Promise<Conversation | undefined> {
    // Updates the LRU position
    if (this.items.get(id) === undefined) {
      return Promise.resolve(undefined as Conversation | undefined);
    }

    const conversation = this.conversations.get(id);
    if (conversation) {
      conversation.metadata = metadata;
      this.conversations.set(id, conversation);
    }
    return Promise.resolve(conversation);
  }

  deleteConversation(id: string): Promise<{ id: string; deleted: boolean }> {
    // Triggers the dispose handler which cleans up this.conversations
    const deleted = this.items.delete(id);
    return Promise.resolve({ id, deleted });
  }

  addItems(conversationId: string, items: ConversationItem[]): Promise<ConversationItem[]> {
    const existing = this.items.get(conversationId);
    if (!existing) {
      return Promise.reject(new Error(`Conversation not found: ${conversationId}`));
    }

    for (const item of items) existing.push(item);
    // Recalculate the cache size
    this.items.set(conversationId, existing);

    return Promise.resolve(items);
  }

  getItem(conversationId: string, itemId: string): Promise<ConversationItem | undefined> {
    return Promise.resolve(this.items.get(conversationId)?.find((item) => item.id === itemId));
  }

  deleteItem(conversationId: string, itemId: string): Promise<Conversation | undefined> {
    const existing = this.items.get(conversationId);
    if (!existing) return Promise.resolve(undefined as Conversation | undefined);

    const i = existing.findIndex((item) => item.id === itemId);
    if (i !== -1) {
      existing.splice(i, 1);
      // Recalculate the cache size
      this.items.set(conversationId, existing);
    }

    return Promise.resolve(this.conversations.get(conversationId));
  }

  listItems(conversationId: string, params?: ListItemsParams): Promise<ConversationItem[]> {
    const existing = this.items.get(conversationId);
    if (!existing) {
      return Promise.reject(new Error(`Conversation not found: ${conversationId}`));
    }

    const { after, order = "desc", limit = 20 } = params ?? {};

    let result = existing;

    if (order === "desc") result = result.toReversed();

    if (after) {
      const i = result.findIndex((item) => item.id === after);
      if (i !== -1) result = result.slice(i + 1);
    }

    return Promise.resolve(result.slice(0, limit));
  }
}
