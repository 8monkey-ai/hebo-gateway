import { LRUCache } from "lru-cache";
import { v7 as uuidv7 } from "uuid";

import type {
  Conversation,
  ConversationItem,
  ConversationItemListParams,
  Metadata,
  ResponseInputItem,
} from "../schema";
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
      noDisposeOnSet: true,
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
      if (obj === null || obj === undefined) continue;

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
  private mapItem(input: ResponseInputItem): ConversationItem {
    const item = { ...input } as ConversationItem;
    item.id ??= uuidv7();
    item.object = "conversation.item";
    item.created_at = Math.floor(Date.now() / 1000);
    return item;
  }

  createConversation(params: {
    metadata?: Metadata;
    items?: ResponseInputItem[];
  }): Promise<Conversation> {
    const id = uuidv7();
    const conversation: Conversation = {
      id,
      object: "conversation",
      created_at: Math.floor(Date.now() / 1000),
      metadata: params.metadata ?? null,
    };

    const itemMap = new Map<string, ConversationItem>();
    if (params.items) {
      for (const input of params.items) {
        const item = this.mapItem(input);
        itemMap.set(item.id, item);
      }
    }

    this.conversations.set(id, conversation);
    this.items.set(id, itemMap);
    return Promise.resolve(conversation);
  }

  getConversation(id: string): Promise<Conversation | undefined> {
    // Updates the LRU position
    if (this.items.get(id) === undefined) {
      return Promise.resolve(undefined as Conversation | undefined);
    }
    return Promise.resolve(this.conversations.get(id));
  }

  updateConversation(id: string, metadata: Metadata): Promise<Conversation | undefined> {
    // Updates the LRU position
    if (this.items.get(id) === undefined) {
      return Promise.resolve(undefined as Conversation | undefined);
    }

    const conversation = this.conversations.get(id);
    if (conversation) {
      conversation.metadata = metadata ?? null;
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
    items: ResponseInputItem[],
  ): Promise<ConversationItem[] | undefined> {
    const existing = this.items.get(conversationId);
    if (!existing) {
      return Promise.resolve(undefined as ConversationItem[] | undefined);
    }

    const mappedItems: ConversationItem[] = [];
    for (const input of items) {
      const item = this.mapItem(input);
      existing.set(item.id, item);
      mappedItems.push(item);
    }
    // Recalculate the cache size
    this.items.set(conversationId, existing);

    return Promise.resolve(mappedItems);
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
    if (!existing) return Promise.resolve(undefined as ConversationItem[] | undefined);
    if (limit <= 0) return Promise.resolve([]);

    // If after is provided but doesn't exist, return empty list
    if (after && !existing.has(after)) return Promise.resolve([]);

    const out: ConversationItem[] = [];

    if (order === "asc") {
      let seen = after === null || after === undefined;
      for (const item of existing.values()) {
        if (!seen) {
          if (item.id === after) seen = true;
          continue;
        }
        out.push(item);
        if (out.length === limit) break;
      }
      return Promise.resolve(out);
    }

    // desc
    for (const item of existing.values()) {
      if (after !== null && after !== undefined && item.id === after) break;
      out.push(item);
      if (out.length > limit) out.shift(); // bounded buffer
    }

    out.reverse();
    return Promise.resolve(out);
  }
}
