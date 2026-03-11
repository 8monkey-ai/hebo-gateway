import * as z from "zod";

/**
 * --- Metadata ---
 */

// Note: The 16-key limit is not currently validated.
export const MetadataSchema = z
  .record(z.string().max(64), z.string().max(512))
  .nullable()
  .optional();
export type Metadata = z.infer<typeof MetadataSchema>;

export const ItemStatusSchema = z.enum(["in_progress", "completed", "incomplete"]);
export type ItemStatus = z.infer<typeof ItemStatusSchema>;

export const ImageDetailSchema = z.enum(["low", "high", "auto"]);
export type ImageDetail = z.infer<typeof ImageDetailSchema>;

/**
 * --- Messaging Content & Items ---
 */

// Content Parts

export const ResponseInputTextSchema = z.object({
  type: z.literal("input_text"),
  text: z.string(),
});
export type ResponseInputText = z.infer<typeof ResponseInputTextSchema>;

const ResponseInputImageURLSchema = z.object({
  type: z.literal("input_image"),
  image_url: z.string(),
  file_id: z.string().optional(),
  detail: ImageDetailSchema.optional(),
});

const ResponseInputImageIDSchema = z.object({
  type: z.literal("input_image"),
  file_id: z.string(),
  image_url: z.string().optional(),
  detail: ImageDetailSchema.optional(),
});

export const ResponseInputImageSchema = z.union([
  ResponseInputImageURLSchema,
  ResponseInputImageIDSchema,
]);
export type ResponseInputImage = z.infer<typeof ResponseInputImageSchema>;

const ResponseInputFileDataSchema = z.object({
  type: z.literal("input_file"),
  file_data: z.string(),
  file_id: z.string().optional(),
  file_url: z.string().optional(),
  filename: z.string().optional(),
});

const ResponseInputFileIDSchema = z.object({
  type: z.literal("input_file"),
  file_id: z.string(),
  file_data: z.string().optional(),
  file_url: z.string().optional(),
  filename: z.string().optional(),
});

const ResponseInputFileURLSchema = z.object({
  type: z.literal("input_file"),
  file_url: z.string(),
  file_data: z.string().optional(),
  file_id: z.string().optional(),
  filename: z.string().optional(),
});

export const ResponseInputFileSchema = z.union([
  ResponseInputFileDataSchema,
  ResponseInputFileIDSchema,
  ResponseInputFileURLSchema,
]);
export type ResponseInputFile = z.infer<typeof ResponseInputFileSchema>;

export const ResponseInputContentSchema = z.union([
  ResponseInputTextSchema,
  ResponseInputImageURLSchema,
  ResponseInputImageIDSchema,
  ResponseInputFileDataSchema,
  ResponseInputFileIDSchema,
  ResponseInputFileURLSchema,
]);
export type ResponseInputContent = z.infer<typeof ResponseInputContentSchema>;

export const ResponseOutputTextSchema = z.object({
  type: z.literal("output_text"),
  text: z.string(),
  annotations: z.array(z.unknown()).optional(),
});
export type ResponseOutputText = z.infer<typeof ResponseOutputTextSchema>;

// Message Items

const MessageItemBaseSchema = z.object({
  type: z.literal("message"),
  id: z.string().optional(),
  status: ItemStatusSchema.optional(),
});

const UserMessageSchema = MessageItemBaseSchema.extend({
  role: z.literal("user"),
  content: z.union([z.string(), z.array(ResponseInputContentSchema)]),
});

const AssistantMessageSchema = MessageItemBaseSchema.extend({
  role: z.literal("assistant"),
  content: z.union([z.string(), z.array(ResponseOutputTextSchema)]),
});

const SystemMessageSchema = MessageItemBaseSchema.extend({
  role: z.literal("system"),
  content: z.union([z.string(), z.array(ResponseInputContentSchema)]),
});

const DeveloperMessageSchema = MessageItemBaseSchema.extend({
  role: z.literal("developer"),
  content: z.union([z.string(), z.array(ResponseInputContentSchema)]),
});

export const MessageItemUnionSchema = z.discriminatedUnion("role", [
  UserMessageSchema,
  AssistantMessageSchema,
  SystemMessageSchema,
  DeveloperMessageSchema,
]);
export type MessageItemUnion = z.infer<typeof MessageItemUnionSchema>;

/**
 * --- Function ---
 */

export const ResponseFunctionToolCallSchema = z.object({
  type: z.literal("function_call"),
  id: z.string().optional(),
  call_id: z.string(),
  name: z.string(),
  arguments: z.string(),
  status: ItemStatusSchema.optional(),
});
export type ResponseFunctionToolCall = z.infer<typeof ResponseFunctionToolCallSchema>;

export const FunctionCallOutputSchema = z.object({
  type: z.literal("function_call_output"),
  id: z.string().optional(),
  call_id: z.string(),
  output: z.union([z.string(), z.array(ResponseInputContentSchema)]),
  status: ItemStatusSchema.optional(),
});
export type FunctionCallOutput = z.infer<typeof FunctionCallOutputSchema>;

/**
 * --- Reasoning ---
 */

export const ResponseSummaryTextSchema = z.object({
  type: z.literal("summary_text"),
  text: z.string(),
});
export type ResponseSummaryText = z.infer<typeof ResponseSummaryTextSchema>;

export const ResponseReasoningTextSchema = z.object({
  type: z.literal("reasoning_text"),
  text: z.string(),
});
export type ResponseReasoningText = z.infer<typeof ResponseReasoningTextSchema>;

export const ResponseReasoningItemSchema = z.object({
  type: z.literal("reasoning"),
  id: z.string().optional(),
  summary: z.array(ResponseSummaryTextSchema),
  content: z.array(ResponseReasoningTextSchema).optional(),
  encrypted_content: z.string().optional(),
  status: ItemStatusSchema.optional(),
});
export type ResponseReasoningItem = z.infer<typeof ResponseReasoningItemSchema>;

/**
 * --- Entities ---
 */

export const ResponseInputItemSchema = z.discriminatedUnion("type", [
  MessageItemUnionSchema,
  ResponseFunctionToolCallSchema,
  FunctionCallOutputSchema,
  ResponseReasoningItemSchema,
]);
export type ResponseInputItem = z.infer<typeof ResponseInputItemSchema>;

export const ConversationItemSchema = z
  .object({
    id: z.string(),
    object: z.literal("conversation.item"),
    created_at: z.number().int(),
  })
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
