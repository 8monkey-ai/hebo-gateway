import * as z from "zod";

export {
  MetadataSchema,
  type Metadata,
  ItemStatusSchema,
  type ItemStatus,
  ImageDetailSchema,
  type ImageDetail,
  ResponseInputTextSchema,
  type ResponseInputText,
  ResponseInputImageSchema,
  type ResponseInputImage,
  ResponseInputFileSchema,
  type ResponseInputFile,
  ResponseInputContentSchema,
  type ResponseInputContent,
  ResponseOutputTextSchema,
  type ResponseOutputText,
  MessageItemUnionSchema,
  type MessageItemUnion,
  ResponseFunctionToolCallSchema,
  type ResponseFunctionToolCall,
  FunctionCallOutputSchema,
  type FunctionCallOutput,
  ResponseSummaryTextSchema,
  type ResponseSummaryText,
  ResponseReasoningTextSchema,
  type ResponseReasoningText,
  ResponseReasoningItemSchema,
  type ResponseReasoningItem,
  ResponseInputItemSchema,
  type ResponseInputItem,
} from "../shared/schema";

import { MetadataSchema, ResponseInputItemSchema } from "../shared/schema";

/**
 * --- Entities ---
 */

export const ConversationItemSchema = z
  .object({
    id: z.string(),
    object: z.literal("conversation.item"),
    created_at: z.number().int(),
  })
  .loose()
  .and(ResponseInputItemSchema);
export type ConversationItem = z.infer<typeof ConversationItemSchema>;

export const ConversationSchema = z.object({
  id: z.string(),
  object: z.literal("conversation"),
  created_at: z.number().int(),
  metadata: MetadataSchema,
});
export type Conversation = z.infer<typeof ConversationSchema>;

export const ConversationDeletedSchema = z.object({
  id: z.string(),
  deleted: z.boolean(),
  object: z.literal("conversation.deleted"),
});
export type ConversationDeleted = z.infer<typeof ConversationDeletedSchema>;

/**
 * --- API ---
 */

export const ConversationCreateParamsSchema = z.object({
  items: z.array(ResponseInputItemSchema).max(1000).optional(),
  metadata: MetadataSchema.optional(),
});
export type ConversationCreateParams = z.infer<typeof ConversationCreateParamsSchema>;

export const ConversationUpdateBodySchema = z.object({
  metadata: MetadataSchema,
});
export type ConversationUpdateBody = z.infer<typeof ConversationUpdateBodySchema>;

export const ConversationItemsAddBodySchema = z.object({
  items: z.array(ResponseInputItemSchema).max(1000),
});
export type ConversationItemsAddBody = z.infer<typeof ConversationItemsAddBodySchema>;

export const ConversationItemListSchema = z.object({
  object: z.literal("list"),
  data: z.array(ConversationItemSchema),
  has_more: z.boolean(),
  first_id: z.string().optional(),
  last_id: z.string().optional(),
});
export type ConversationItemList = z.infer<typeof ConversationItemListSchema>;

export const ConversationListSchema = z.object({
  object: z.literal("list"),
  data: z.array(ConversationSchema),
  has_more: z.boolean(),
  first_id: z.string().optional(),
  last_id: z.string().optional(),
});
export type ConversationList = z.infer<typeof ConversationListSchema>;

export const ConversationItemListParamsSchema = z.object({
  after: z.string().optional(),
  limit: z.coerce.number().int().min(0).max(1000).default(20),
  order: z.enum(["asc", "desc"]).default("desc"),
});
export type ConversationItemListParams = z.infer<typeof ConversationItemListParamsSchema>;

export const ConversationListParamsSchema = z.preprocess(
  (input) => {
    if (typeof input !== "object" || input === null) return input;

    const metadata: Record<string, string> = {};
    const rest: Record<string, unknown> = { ...(input as Record<string, unknown>) };

    for (const [key, value] of Object.entries(input)) {
      if (key.startsWith("metadata.")) {
        metadata[key.slice(9)] = String(value);
        delete rest[key];
      }
    }

    if (Object.keys(metadata).length > 0) {
      rest["metadata"] = metadata;
    }

    return rest;
  },
  ConversationItemListParamsSchema.extend({
    metadata: MetadataSchema.optional(),
  }),
);
export type ConversationListParams = z.infer<typeof ConversationListParamsSchema>;
