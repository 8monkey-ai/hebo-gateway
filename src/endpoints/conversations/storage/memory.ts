import type { Conversation, ConversationItem, ConversationItemInput } from "../schema";
import type { ConversationStorage, ListItemsParams } from "./types";

export class InMemoryStorage implements ConversationStorage {
  private conversations = new Map<string, Conversation>();
  private items = new Map<string, ConversationItem[]>();

  async createConversation(params: {
    items?: ConversationItemInput[];
    metadata?: Record<string, unknown>;
  }): Promise<Conversation> {
    const id = `conv_${crypto.randomUUID()}`;
    const now = Math.floor(Date.now() / 1000);

    const conversation: Conversation = {
      id,
      object: "conversation",
      created_at: now,
      metadata: params.metadata ?? {},
    };

    this.conversations.set(id, conversation);
    this.items.set(id, []);

    if (params.items && params.items.length > 0) {
      await this.addItems(id, params.items);
    }

    return conversation;
  }

  // eslint-disable-next-line require-await
  async getConversation(id: string): Promise<Conversation | undefined> {
    return this.conversations.get(id);
  }

  // eslint-disable-next-line require-await
  async updateConversation(
    id: string,
    params: { metadata: Record<string, unknown> },
  ): Promise<Conversation> {
    const conversation = this.conversations.get(id);
    if (!conversation) {
      throw new Error(`Conversation not found: ${id}`);
    }

    const updated = {
      ...conversation,
      metadata: params.metadata,
    };

    this.conversations.set(id, updated);
    return updated;
  }

  // eslint-disable-next-line require-await
  async deleteConversation(id: string): Promise<{ id: string; deleted: boolean }> {
    const deleted = this.conversations.delete(id);
    // Current OpenAI API behavior: "Items in the conversation will not be deleted."
    return { id, deleted };
  }

  // eslint-disable-next-line require-await
  async addItems(
    conversationId: string,
    items: ConversationItemInput[],
  ): Promise<ConversationItem[]> {
    const conversationItems = this.items.get(conversationId);
    if (!conversationItems) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const now = Math.floor(Date.now() / 1000);
    const newItems: ConversationItem[] = items.map((item) => {
      const conversationItem: ConversationItem = {
        id: `item_${crypto.randomUUID()}`,
        object: "conversation.item",
        created_at: now,
        ...item,
      } as ConversationItem;
      return conversationItem;
    });

    conversationItems.push(...newItems);
    return newItems;
  }

  // eslint-disable-next-line require-await
  async getItem(conversationId: string, itemId: string): Promise<ConversationItem | undefined> {
    const conversationItems = this.items.get(conversationId);
    if (!conversationItems) return undefined;
    return conversationItems.find((item) => item.id === itemId);
  }

  // eslint-disable-next-line require-await
  async deleteItem(
    conversationId: string,
    itemId: string,
  ): Promise<{ id: string; deleted: boolean }> {
    const conversationItems = this.items.get(conversationId);
    if (!conversationItems) return { id: itemId, deleted: false };

    const initialLength = conversationItems.length;
    const filtered = conversationItems.filter((item) => item.id !== itemId);
    this.items.set(conversationId, filtered);

    return { id: itemId, deleted: filtered.length < initialLength };
  }

  // eslint-disable-next-line require-await
  async listItems(conversationId: string, params?: ListItemsParams): Promise<ConversationItem[]> {
    let conversationItems = this.items.get(conversationId);
    if (!conversationItems) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    // Cloning to avoid mutation during sort/pagination
    let result = [...conversationItems];

    if (params?.after) {
      const index = result.findIndex((item) => item.id === params.after);
      if (index !== -1) {
        result = result.slice(index + 1);
      }
    }

    const order = params?.order ?? "desc";
    if (order === "desc") {
      result.reverse();
    }

    const limit = params?.limit ?? 20;
    result = result.slice(0, limit);

    return result;
  }
}
