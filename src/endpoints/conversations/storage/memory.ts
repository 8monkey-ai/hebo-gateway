import { LRUCache } from "lru-cache";

import type { Conversation, ConversationItem } from "../schema";
import type { ConversationStorage, ListItemsParams } from "./types";

export class InMemoryStorage implements ConversationStorage {
  private conversations: LRUCache<string, Conversation>;
  private items: LRUCache<string, ConversationItem[]>;

  constructor(options?: { max?: number }) {
    const max = options?.max ?? 1000;

    this.items = new LRUCache<string, ConversationItem[]>({ max });
    this.conversations = new LRUCache<string, Conversation>({
      max,
      dispose: (_value, key) => {
        this.items.delete(key);
      },
    });
  }

  // eslint-disable-next-line require-await
  async createConversation(conversation: Conversation): Promise<Conversation> {
    this.conversations.set(conversation.id, conversation);
    this.items.set(conversation.id, []);
    return conversation;
  }

  // eslint-disable-next-line require-await
  async getConversation(id: string): Promise<Conversation | undefined> {
    return this.conversations.get(id);
  }

  // eslint-disable-next-line require-await
  async updateConversation(conversation: Conversation): Promise<Conversation> {
    this.conversations.set(conversation.id, conversation);
    return conversation;
  }

  // eslint-disable-next-line require-await
  async deleteConversation(id: string): Promise<{ id: string; deleted: boolean }> {
    const deleted = this.conversations.delete(id);
    this.items.delete(id);
    return { id, deleted };
  }

  // eslint-disable-next-line require-await
  async addItems(conversationId: string, items: ConversationItem[]): Promise<ConversationItem[]> {
    const existing = this.items.get(conversationId);
    if (!existing) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    existing.push(...items);
    return items;
  }

  // eslint-disable-next-line require-await
  async getItem(conversationId: string, itemId: string): Promise<ConversationItem | undefined> {
    return this.items.get(conversationId)?.find((item) => item.id === itemId);
  }

  // eslint-disable-next-line require-await
  async deleteItem(
    conversationId: string,
    itemId: string,
  ): Promise<{ id: string; deleted: boolean }> {
    const existing = this.items.get(conversationId);
    if (!existing) return { id: itemId, deleted: false };

    const i = existing.findIndex((item) => item.id === itemId);
    if (i === -1) return { id: itemId, deleted: false };
    existing.splice(i, 1);

    return { id: itemId, deleted: true };
  }

  // eslint-disable-next-line require-await
  async listItems(conversationId: string, params?: ListItemsParams): Promise<ConversationItem[]> {
    const existing = this.items.get(conversationId);
    if (!existing) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const { after, order = "desc", limit = 20 } = params ?? {};

    let result = existing;

    if (order === "desc") result = result.slice().toReversed();

    if (after) {
      const i = result.findIndex((item) => item.id === after);
      if (i !== -1) result = result.slice(i + 1);
    }

    return result.slice(0, limit);
  }
}
