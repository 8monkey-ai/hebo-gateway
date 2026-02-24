import type { ChatCompletionsMessage } from "../endpoints/chat-completions/schema";
import type { Conversation, ConversationItem, ConversationStorage } from "./types";

/**
 * An in-memory implementation of `ConversationStorage`.
 * Suitable for development and non-persistent testing.
 */
export class InMemoryStorage implements ConversationStorage {
  private conversations = new Map<string, Conversation>();
  private items = new Map<string, ConversationItem[]>();

  // eslint-disable-next-line require-await
  async createConversation(params: { metadata?: Record<string, unknown> }): Promise<Conversation> {
    const id = `conv_${crypto.randomUUID().replaceAll("-", "")}`;
    const conversation: Conversation = {
      id,
      object: "conversation",
      created_at: Math.floor(Date.now() / 1000),
      metadata: params.metadata ?? {},
    };
    this.conversations.set(id, conversation);
    this.items.set(id, []);
    return conversation;
  }

  // eslint-disable-next-line require-await
  async getConversation(id: string): Promise<Conversation | undefined> {
    return this.conversations.get(id);
  }

  // eslint-disable-next-line require-await
  async addItems(
    conversationId: string,
    messages: ChatCompletionsMessage[],
  ): Promise<ConversationItem[]> {
    const conversationItems = this.items.get(conversationId);
    if (!conversationItems) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const newItems: ConversationItem[] = messages.map((message) => ({
      id: `item_${crypto.randomUUID().replaceAll("-", "")}`,
      object: "conversation.item",
      created_at: Math.floor(Date.now() / 1000),
      message,
    }));

    conversationItems.push(...newItems);
    return newItems;
  }

  // eslint-disable-next-line require-await
  async listItems(conversationId: string): Promise<ConversationItem[]> {
    const conversationItems = this.items.get(conversationId);
    if (!conversationItems) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }
    return [...conversationItems];
  }
}
