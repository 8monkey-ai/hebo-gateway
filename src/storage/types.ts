import type { ChatCompletionsMessage } from "../endpoints/chat-completions/schema";

/**
 * A single item in a conversation (e.g., a message or tool output).
 */
export type ConversationItem = {
  id: string;
  object: "conversation.item";
  created_at: number;
  /**
   * The underlying message data (role, content, etc.).
   */
  message: ChatCompletionsMessage;
  /**
   * Optional metadata for the item.
   */
  metadata?: Record<string, unknown>;
};

/**
 * A conversation container.
 */
export type Conversation = {
  id: string;
  object: "conversation";
  created_at: number;
  metadata: Record<string, unknown>;
};

/**
 * Interface for pluggable conversation storage backends.
 */
export interface ConversationStorage {
  /**
   * Creates a new conversation.
   */
  createConversation(params: { metadata?: Record<string, unknown> }): Promise<Conversation>;

  /**
   * Retrieves a conversation by ID.
   */
  getConversation(id: string): Promise<Conversation | undefined>;

  /**
   * Appends items to a conversation.
   * @returns The newly created items with IDs and timestamps.
   */
  addItems(conversationId: string, messages: ChatCompletionsMessage[]): Promise<ConversationItem[]>;

  /**
   * Lists all items in a conversation in chronological order.
   */
  listItems(conversationId: string): Promise<ConversationItem[]>;
}
