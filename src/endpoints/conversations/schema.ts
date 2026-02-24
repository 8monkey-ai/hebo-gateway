import * as z from "zod";

import { ChatCompletionsMessageSchema } from "../chat-completions/schema";

/**
 * Schema for creating a new conversation.
 */
export const ConversationCreateBodySchema = z.object({
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type ConversationCreateBody = z.infer<typeof ConversationCreateBodySchema>;

/**
 * OpenAI-compatible Conversation object.
 */
export const ConversationSchema = z.object({
  id: z.string(),
  object: z.literal("conversation"),
  created_at: z.number().int(),
  metadata: z.record(z.string(), z.unknown()),
});
export type Conversation = z.infer<typeof ConversationSchema>;

/**
 * OpenAI-compatible item input.
 * We extend the standard message schema with an optional 'type' field.
 */
export const ConversationItemInputSchema = ChatCompletionsMessageSchema.and(
  z.object({
    type: z.literal("message").optional().default("message"),
  }),
);
export type ConversationItemInput = z.infer<typeof ConversationItemInputSchema>;

/**
 * Schema for adding items to a conversation.
 */
export const ConversationItemsAddBodySchema = z.object({
  items: z.array(ConversationItemInputSchema),
});
export type ConversationItemsAddBody = z.infer<typeof ConversationItemsAddBodySchema>;

/**
 * OpenAI-compatible Conversation Item object.
 */
export const ConversationItemSchema = z.object({
  id: z.string(),
  object: z.literal("conversation.item"),
  created_at: z.number().int(),
  type: z.literal("message"),
  role: z.enum(["user", "assistant", "system", "developer"]),
  content: z.any(), // Match ChatCompletionsMessage content
});
export type ConversationItem = z.infer<typeof ConversationItemSchema>;

/**
 * OpenAI-compatible list of items.
 */
export const ConversationItemListSchema = z.object({
  object: z.literal("list"),
  data: z.array(ConversationItemSchema),
  has_more: z.boolean(),
  first_id: z.string().optional(),
  last_id: z.string().optional(),
});
export type ConversationItemList = z.infer<typeof ConversationItemListSchema>;
