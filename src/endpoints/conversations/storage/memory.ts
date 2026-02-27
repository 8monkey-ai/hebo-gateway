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

  private estimateSize(root: unknown): number {
    let total = 0;
    const stack: unknown[] = [root];

    while (stack.length > 0) {
      const obj = stack.pop();
      if (obj == null) continue;

      const t = typeof obj;
      if (t === "string") {
        total += (obj as string).length * 2;
        continue;
      }
      if (t !== "object") continue;

      if (ArrayBuffer.isView(obj)) {
        total += (obj as ArrayBufferView).byteLength;
        continue;
      }

      if (Array.isArray(obj)) {
        const arr = obj as unknown[];
        for (let i = 0, n = arr.length; i < n; i++) stack.push(arr[i]);
        continue;
      }

      if (obj instanceof Map) {
        for (const [k, v] of obj as Map<unknown, unknown>) {
          stack.push(k);
          stack.push(v);
        }
        continue;
      }

      const rec = obj as Record<string, unknown>;
      for (const k in rec) stack.push(rec[k]);
    }

    return total;
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
