import { LRUCache } from "lru-cache";
import { v7 as uuidv7 } from "uuid";

import type {
  ConversationStorage,
  ConversationEntity,
  ConversationItemEntity,
  ConversationMetadata,
  ConversationItemInput,
  ConversationQueryOptions,
} from "./types";

export class InMemoryStorage implements ConversationStorage {
  private conversations = new Map<string, ConversationEntity>();
  private items: LRUCache<string, Map<string, ConversationItemEntity>>;

  constructor(options?: { maxSize?: number }) {
    // Default to 256MB
    const maxSize = options?.maxSize ?? 256 * 1024 * 1024;

    this.items = new LRUCache<string, Map<string, ConversationItemEntity>>({
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
        total += obj.byteLength;
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
  private mapItem(conversationId: string, input: ConversationItemInput): ConversationItemEntity {
    const item = input as ConversationItemEntity;
    item.id ??= uuidv7();
    item.conversation_id = conversationId;
    item.created_at = Date.now();
    return item;
  }

  createConversation(params: {
    metadata?: ConversationMetadata;
    items?: ConversationItemInput[];
  }): Promise<ConversationEntity> {
    const id = uuidv7();
    const conversation: ConversationEntity = {
      id,
      created_at: Date.now(),
      metadata: params.metadata ?? null,
    };

    const itemMap = new Map<string, ConversationItemEntity>();
    if (params.items) {
      for (const input of params.items) {
        const item = this.mapItem(id, input);
        itemMap.set(item.id, item);
      }
    }

    this.conversations.set(id, conversation);
    this.items.set(id, itemMap);
    return Promise.resolve(conversation);
  }

  getConversation(id: string): Promise<ConversationEntity | undefined> {
    // Updates the LRU position
    if (this.items.get(id) === undefined) {
      return Promise.resolve(undefined as ConversationEntity | undefined);
    }
    return Promise.resolve(this.conversations.get(id));
  }

  listConversations(params: ConversationQueryOptions): Promise<ConversationEntity[]> {
    const { after, order, limit, metadata } = params;
    if (limit <= 0) return Promise.resolve([]);

    let results = Array.from(this.conversations.values());

    // Filter by metadata
    if (metadata) {
      results = results.filter((conv) => {
        if (!conv.metadata) return false;
        for (const [key, value] of Object.entries(metadata)) {
          if (conv.metadata[key] !== value) return false;
        }
        return true;
      });
    }

    // Sort by created_at (and ID as tiebreaker for cursor consistency)
    results.sort((a, b) => {
      if (a.created_at !== b.created_at) {
        return order === "asc" ? a.created_at - b.created_at : b.created_at - a.created_at;
      }
      return order === "asc" ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id);
    });

    // Pagination: after
    if (after) {
      const index = results.findIndex((conv) => conv.id === after);
      if (index === -1) return Promise.resolve([]);
      results = results.slice(index + 1);
    }

    return Promise.resolve(results.slice(0, limit));
  }

  updateConversation(
    id: string,
    metadata: ConversationMetadata,
  ): Promise<ConversationEntity | undefined> {
    // Updates the LRU position
    if (this.items.get(id) === undefined) {
      return Promise.resolve(undefined as ConversationEntity | undefined);
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
    items: ConversationItemInput[],
  ): Promise<ConversationItemEntity[] | undefined> {
    const existing = this.items.get(conversationId);
    if (!existing) {
      return Promise.resolve(undefined as ConversationItemEntity[] | undefined);
    }

    const mappedItems: ConversationItemEntity[] = [];
    for (const input of items) {
      const item = this.mapItem(conversationId, input);
      existing.set(item.id, item);
      mappedItems.push(item);
    }
    // Recalculate the cache size
    this.items.set(conversationId, existing);

    return Promise.resolve(mappedItems);
  }

  getItem(conversationId: string, itemId: string): Promise<ConversationItemEntity | undefined> {
    return Promise.resolve(this.items.get(conversationId)?.get(itemId));
  }

  deleteItem(conversationId: string, itemId: string): Promise<ConversationEntity | undefined> {
    const existing = this.items.get(conversationId);
    if (!existing) return Promise.resolve(undefined as ConversationEntity | undefined);

    if (existing.delete(itemId)) {
      // Recalculate the cache size
      this.items.set(conversationId, existing);
    }

    return Promise.resolve(this.conversations.get(conversationId));
  }

  listItems(
    conversationId: string,
    params: ConversationQueryOptions,
  ): Promise<ConversationItemEntity[] | undefined> {
    const { after, order, limit } = params;
    const existing = this.items.get(conversationId);
    if (!existing) return Promise.resolve(undefined as ConversationItemEntity[] | undefined);
    if (limit <= 0) return Promise.resolve([]);

    // If after is provided but doesn't exist, return empty list
    if (after && !existing.has(after)) return Promise.resolve([]);

    const out: ConversationItemEntity[] = [];

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
