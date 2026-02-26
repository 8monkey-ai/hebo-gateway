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

  createConversation(conversation: Conversation): Promise<Conversation> {
    this.conversations.set(conversation.id, conversation);
    this.items.set(conversation.id, []);
    return Promise.resolve(conversation);
  }

  getConversation(id: string): Promise<Conversation | undefined> {
    // Touching the items cache updates the LRU position for the entire conversation
    if (this.items.get(id) === undefined) {
      return Promise.resolve(undefined as Conversation | undefined);
    }
    return Promise.resolve(this.conversations.get(id));
  }

  updateConversation(conversation: Conversation): Promise<Conversation> {
    if (this.items.get(conversation.id) !== undefined) {
      this.conversations.set(conversation.id, conversation);
    }
    return Promise.resolve(conversation);
  }

  deleteConversation(id: string): Promise<{ id: string; deleted: boolean }> {
    // this.items.delete triggers the dispose handler which cleans up this.conversations
    const deleted = this.items.delete(id);
    return Promise.resolve({ id, deleted });
  }

  addItems(conversationId: string, items: ConversationItem[]): Promise<ConversationItem[]> {
    const existing = this.items.get(conversationId);
    if (!existing) {
      return Promise.reject(new Error(`Conversation not found: ${conversationId}`));
    }

    for (const item of items) existing.push(item);
    // Re-set to recalculate the size based on JSON string length
    this.items.set(conversationId, existing);

    return Promise.resolve(items);
  }

  getItem(conversationId: string, itemId: string): Promise<ConversationItem | undefined> {
    return Promise.resolve(this.items.get(conversationId)?.find((item) => item.id === itemId));
  }

  deleteItem(conversationId: string, itemId: string): Promise<{ id: string; deleted: boolean }> {
    const existing = this.items.get(conversationId);
    if (!existing) return Promise.resolve({ id: itemId, deleted: false });

    const i = existing.findIndex((item) => item.id === itemId);
    if (i === -1) return Promise.resolve({ id: itemId, deleted: false });

    existing.splice(i, 1);
    // Re-set to update the LRU cache size tracking after removal
    this.items.set(conversationId, existing);

    return Promise.resolve({ id: itemId, deleted: true });
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
