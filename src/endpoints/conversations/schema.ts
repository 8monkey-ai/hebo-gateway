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

export const InputTextContentSchema = z.object({
  type: z.literal("input_text"),
  text: z.string(),
});

export const InputImageContentSchema = z.object({
  type: z.literal("input_image"),
  image_url: z.string().optional(),
  file_id: z.string().optional(),
  detail: ImageDetailSchema.optional(),
});

export const InputFileContentSchema = z.object({
  type: z.literal("input_file"),
  filename: z.string().optional(),
  file_data: z.string().optional(),
  file_id: z.string().optional(),
  file_url: z.string().optional(),
});

export const OutputTextContentSchema = z.object({
  type: z.literal("output_text"),
  text: z.string(),
  annotations: z.array(z.any()).optional(),
});

export const SummaryTextContentSchema = z.object({
  type: z.literal("summary_text"),
  text: z.string(),
});

export const ReasoningTextContentSchema = z.object({
  type: z.literal("reasoning_text"),
  text: z.string(),
});

// --- Message ---

const MessageItemBase = z.object({
  type: z.literal("message"),
  status: ItemStatusSchema.optional(),
});

const UserMessage = MessageItemBase.extend({
  role: z.literal("user"),
  content: z.union([
    z.string(),
    z.array(z.union([InputTextContentSchema, InputImageContentSchema, InputFileContentSchema])),
  ]),
});

const AssistantMessage = MessageItemBase.extend({
  role: z.literal("assistant"),
  content: z.union([z.string(), z.array(OutputTextContentSchema)]),
});

const SystemMessage = MessageItemBase.extend({
  role: z.literal("system"),
  content: z.union([z.string(), z.array(InputTextContentSchema)]),
});

const DeveloperMessage = MessageItemBase.extend({
  role: z.literal("developer"),
  content: z.union([z.string(), z.array(InputTextContentSchema)]),
});

export const MessageItemUnion = z.union([
  UserMessage,
  AssistantMessage,
  SystemMessage,
  DeveloperMessage,
]);

// --- Item ---

const FunctionCallItem = z.object({
  type: z.literal("function_call"),
  id: z.string().optional(),
  call_id: z.string(),
  name: z.string(),
  arguments: z.string(),
  status: ItemStatusSchema.optional(),
});

const FunctionCallOutputItem = z.object({
  type: z.literal("function_call_output"),
  id: z.string().optional(),
  call_id: z.string(),
  output: z.union([
    z.string(),
    z.array(z.union([InputTextContentSchema, InputImageContentSchema, InputFileContentSchema])),
  ]),
  status: ItemStatusSchema.optional(),
});

const ReasoningItem = z.object({
  type: z.literal("reasoning"),
  id: z.string().optional(),
  summary: z.array(SummaryTextContentSchema),
  content: z.array(ReasoningTextContentSchema).optional(),
  encrypted_content: z.string().optional(),
  status: ItemStatusSchema.optional(),
});

// Item: Request
export const ConversationItemInputSchema = z.union([
  MessageItemUnion,
  FunctionCallItem,
  FunctionCallOutputItem,
  ReasoningItem,
]);
export type ConversationItemInput = z.infer<typeof ConversationItemInputSchema>;

export const ConversationItemsAddBodySchema = z.object({
  items: z.array(ConversationItemInputSchema).max(20),
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
    content: z.any(),
    status: ItemStatusSchema.optional(),
  }),
  withSystemFields(FunctionCallItem.omit({ id: true }).shape),
  withSystemFields(FunctionCallOutputItem.omit({ id: true }).shape),
  withSystemFields(ReasoningItem.omit({ id: true }).shape),
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

// --- Conversation ---

// Conversation: Request
export const ConversationCreateBodySchema = z.object({
  items: z.array(ConversationItemInputSchema).max(20).optional(),
  metadata: MetadataSchema.optional(),
});
export type ConversationCreateBody = z.infer<typeof ConversationCreateBodySchema>;

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
