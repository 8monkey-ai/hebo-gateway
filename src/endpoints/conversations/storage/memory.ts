import { LRUCache } from "lru-cache";

import type { Conversation, ConversationItem, ConversationItemListParams } from "../schema";
import type { ConversationStorage } from "./types";

export class InMemoryStorage implements ConversationStorage {
  private conversations = new Map<string, Conversation>();
  private items: LRUCache<string, Map<string, ConversationItem>>;

  constructor(options?: { maxSize?: number }) {
    // Default to 256MB
    const maxSize = options?.maxSize ?? 256 * 1024 * 1024;

    this.items = new LRUCache<string, Map<string, ConversationItem>>({
      maxSize,
      sizeCalculation: (items) => Math.max(1, this.estimateSize(items)),
      dispose: (_value, key) => {
        this.conversations.delete(key);
      },
    });
  }

  private estimateSize(obj: unknown): number {
    if (typeof obj === "string") return obj.length;
    if (obj instanceof Uint8Array) return obj.length;
    if (obj instanceof Map) {
      let size = 0;
      for (const [key, value] of obj) {
        size += this.estimateSize(key) + this.estimateSize(value);
      }
      return size;
    }
    if (Array.isArray(obj)) {
      return obj.reduce((acc, item) => acc + this.estimateSize(item), 0);
    }
    if (typeof obj === "object" && obj !== null) {
      let size = 0;
      for (const key in obj) {
        size += this.estimateSize((obj as Record<string, unknown>)[key]);
      }
      return size;
    }
    return 0;
  }

  createConversation(
    conversation: Conversation,
    items?: ConversationItem[],
  ): Promise<Conversation> {
    const itemMap = new Map<string, ConversationItem>();
    if (items) {
      for (const item of items) {
        itemMap.set(item.id, item);
      }
    }

    this.conversations.set(conversation.id, conversation);
    this.items.set(conversation.id, itemMap);
    return Promise.resolve(conversation);
  }

  getConversation(id: string): Promise<Conversation | undefined> {
    // Updates the LRU position
    if (this.items.get(id) === undefined) {
      return Promise.resolve(undefined as Conversation | undefined);
    }
    return Promise.resolve(this.conversations.get(id));
  }

  updateConversation(
    id: string,
    metadata: Record<string, unknown>,
  ): Promise<Conversation | undefined> {
    // Updates the LRU position
    if (this.items.get(id) === undefined) {
      return Promise.resolve(undefined as Conversation | undefined);
    }

    const conversation = this.conversations.get(id);
    if (conversation) {
      conversation.metadata = metadata;
    }
    return Promise.resolve(conversation);
  }

  deleteConversation(id: string): Promise<{ id: string; deleted: boolean }> {
    // Triggers the dispose handler which cleans up this.conversations
    const deleted = this.items.delete(id);
    return Promise.resolve({ id, deleted });
  }

  addItems(
    conversationId: string,
    items: ConversationItem[],
  ): Promise<ConversationItem[] | undefined> {
    const existing = this.items.get(conversationId);
    if (!existing) {
      return Promise.resolve(undefined as ConversationItem[] | undefined);
    }

    for (const item of items) {
      existing.set(item.id, item);
    }
    // Recalculate the cache size
    this.items.set(conversationId, existing);

    return Promise.resolve(items);
  }

  getItem(conversationId: string, itemId: string): Promise<ConversationItem | undefined> {
    return Promise.resolve(this.items.get(conversationId)?.get(itemId));
  }

  deleteItem(conversationId: string, itemId: string): Promise<Conversation | undefined> {
    const existing = this.items.get(conversationId);
    if (!existing) return Promise.resolve(undefined as Conversation | undefined);

    if (existing.delete(itemId)) {
      // Recalculate the cache size
      this.items.set(conversationId, existing);
    }

    return Promise.resolve(this.conversations.get(conversationId));
  }

  listItems(
    conversationId: string,
    params: ConversationItemListParams,
  ): Promise<ConversationItem[] | undefined> {
    const { after, order, limit } = params;
    const existing = this.items.get(conversationId);
    if (!existing) {
      return Promise.resolve(undefined as ConversationItem[] | undefined);
    }

    let result = Array.from(existing.values());

    if (order === "desc") result = result.toReversed();

    if (after) {
      const i = result.findIndex((item) => item.id === after);
      if (i !== -1) result = result.slice(i + 1);
    }

    return Promise.resolve(result.slice(0, limit));
  }
}
