import * as z from "zod";

// --- Common ---

export const MetadataSchema = z
  .record(z.string().max(64), z.union([z.string().max(512), z.number(), z.boolean()]))
  .refine((m) => Object.keys(m).length <= 16, {
    message: "Metadata can have at most 16 keys",
  });

export const ItemStatusSchema = z.enum(["in_progress", "completed", "incomplete"]);
export const ImageDetailSchema = z.enum(["low", "high", "auto"]);

// --- Content ---

export const ResponseInputTextSchema = z.object({
  type: z.literal("input_text"),
  text: z.string(),
});

export const ResponseInputImageSchema = z
  .object({
    type: z.literal("input_image"),
    image_url: z.string().nullable().optional(),
    file_id: z.string().nullable().optional(),
    detail: ImageDetailSchema.optional(),
  })
  .refine((data) => data.image_url || data.file_id, {
    message: "Either 'image_url' or 'file_id' must be provided",
  });

export const ResponseInputFileSchema = z
  .object({
    type: z.literal("input_file"),
    filename: z.string().optional(),
    file_data: z.string().nullable().optional(),
    file_id: z.string().nullable().optional(),
    file_url: z.string().nullable().optional(),
  })
  .refine((data) => data.file_data || data.file_id || data.file_url, {
    message: "At least one of 'file_data', 'file_id', or 'file_url' must be provided",
  });

export const ResponseOutputTextSchema = z.object({
  type: z.literal("output_text"),
  text: z.string(),
  annotations: z.array(z.unknown()).optional(),
});

export const ResponseSummaryTextSchema = z.object({
  type: z.literal("summary_text"),
  text: z.string(),
});

export const ResponseReasoningTextSchema = z.object({
  type: z.literal("reasoning_text"),
  text: z.string(),
});

// --- Message ---

const MessageItemBase = z.object({
  type: z.literal("message"),
  id: z.string().optional(),
  status: ItemStatusSchema.optional(),
});

const UserMessage = MessageItemBase.extend({
  role: z.literal("user"),
  content: z.union([
    z.string(),
    z.array(z.union([ResponseInputTextSchema, ResponseInputImageSchema, ResponseInputFileSchema])),
  ]),
});

const AssistantMessage = MessageItemBase.extend({
  role: z.literal("assistant"),
  content: z.union([z.string(), z.array(ResponseOutputTextSchema)]),
});

const SystemMessage = MessageItemBase.extend({
  role: z.literal("system"),
  content: z.union([z.string(), z.array(ResponseInputTextSchema)]),
});

const DeveloperMessage = MessageItemBase.extend({
  role: z.literal("developer"),
  content: z.union([z.string(), z.array(ResponseInputTextSchema)]),
});

export const MessageItemUnion = z.union([
  UserMessage,
  AssistantMessage,
  SystemMessage,
  DeveloperMessage,
]);

// --- Item ---

const ResponseFunctionToolCallSchema = z.object({
  type: z.literal("function_call"),
  id: z.string().optional(),
  call_id: z.string(),
  name: z.string(),
  arguments: z.string(),
  status: ItemStatusSchema.optional(),
});

const FunctionCallOutputSchema = z.object({
  type: z.literal("function_call_output"),
  id: z.string().optional(),
  call_id: z.string(),
  output: z.union([
    z.string(),
    z.array(z.union([ResponseInputTextSchema, ResponseInputImageSchema, ResponseInputFileSchema])),
  ]),
  status: ItemStatusSchema.optional(),
});

const ResponseReasoningItemSchema = z.object({
  type: z.literal("reasoning"),
  id: z.string().optional(),
  summary: z.array(ResponseSummaryTextSchema),
  content: z.array(ResponseReasoningTextSchema).optional(),
  encrypted_content: z.string().optional(),
  status: ItemStatusSchema.optional(),
});

// Item: Request
export const ResponseInputItemSchema = z.union([
  MessageItemUnion,
  ResponseFunctionToolCallSchema,
  FunctionCallOutputSchema,
  ResponseReasoningItemSchema,
]);
export type ResponseInputItem = z.infer<typeof ResponseInputItemSchema>;

export const ConversationItemsAddBodySchema = z.object({
  items: z.array(ResponseInputItemSchema).max(20),
});
export type ConversationItemsAddBody = z.infer<typeof ConversationItemsAddBodySchema>;

// Item: Stored
const withSystemFields = <T extends z.ZodRawShape>(shape: T) =>
  z.object({
    id: z.string(),
    object: z.literal("conversation.item"),
    created_at: z.number().int(),
    ...shape,
  });

export const ConversationItemSchema = z.discriminatedUnion("type", [
  withSystemFields({
    type: z.literal("message"),
    role: z.enum(["user", "assistant", "system", "developer"]),
    content: z.unknown(),
    status: ItemStatusSchema.optional(),
  }),
  withSystemFields(ResponseFunctionToolCallSchema.omit({ id: true }).shape),
  withSystemFields(FunctionCallOutputSchema.omit({ id: true }).shape),
  withSystemFields(ResponseReasoningItemSchema.omit({ id: true }).shape),
]);
export type ConversationItem = z.infer<typeof ConversationItemSchema>;

// Item: List
export const ConversationItemListSchema = z.object({
  object: z.literal("list"),
  data: z.array(ConversationItemSchema),
  has_more: z.boolean(),
  first_id: z.string().optional(),
  last_id: z.string().optional(),
});
export type ConversationItemList = z.infer<typeof ConversationItemListSchema>;

export const ConversationItemListParamsSchema = z.object({
  after: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  order: z.enum(["asc", "desc"]).default("desc"),
  // FUTURE: Add support for "include" array
});
export type ConversationItemListParams = z.infer<typeof ConversationItemListParamsSchema>;

// --- Conversation ---

// Conversation: Request
export const ConversationCreateParamsSchema = z.object({
  items: z.array(ResponseInputItemSchema).max(20).optional(),
  metadata: MetadataSchema.optional(),
});
export type ConversationCreateParams = z.infer<typeof ConversationCreateParamsSchema>;

export const ConversationUpdateBodySchema = z.object({
  metadata: MetadataSchema,
});
export type ConversationUpdateBody = z.infer<typeof ConversationUpdateBodySchema>;

export const ConversationDeletedSchema = z.object({
  id: z.string(),
  deleted: z.boolean(),
  object: z.literal("conversation.deleted"),
});
export type ConversationDeleted = z.infer<typeof ConversationDeletedSchema>;

// Conversation: Stored
export const ConversationSchema = z.object({
  id: z.string(),
  object: z.literal("conversation"),
  created_at: z.number().int(),
  metadata: z.record(z.string(), z.unknown()),
});
export type Conversation = z.infer<typeof ConversationSchema>;
