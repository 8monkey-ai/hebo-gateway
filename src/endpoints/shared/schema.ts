import * as z from "zod";

/**
 * Shared Open Responses item schemas used by both /conversations and /responses.
 */

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

const MessageItemBaseSchema = z
  .object({
    type: z.literal("message"),
    id: z.string().optional(),
    status: ItemStatusSchema.optional(),
  })
  .loose();

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

export const ResponseFunctionToolCallSchema = z
  .object({
    type: z.literal("function_call"),
    id: z.string().optional(),
    call_id: z.string(),
    name: z.string(),
    arguments: z.string(),
    status: ItemStatusSchema.optional(),
  })
  .loose();
export type ResponseFunctionToolCall = z.infer<typeof ResponseFunctionToolCallSchema>;

export const FunctionCallOutputSchema = z
  .object({
    type: z.literal("function_call_output"),
    id: z.string().optional(),
    call_id: z.string(),
    output: z.union([z.string(), z.array(ResponseInputContentSchema)]),
    status: ItemStatusSchema.optional(),
  })
  .loose();
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

export const ResponseReasoningItemSchema = z
  .object({
    type: z.literal("reasoning"),
    id: z.string().optional(),
    summary: z.array(ResponseSummaryTextSchema),
    content: z.array(ResponseReasoningTextSchema).optional(),
    encrypted_content: z.string().optional(),
    status: ItemStatusSchema.optional(),
  })
  .loose();
export type ResponseReasoningItem = z.infer<typeof ResponseReasoningItemSchema>;

/**
 * --- Input Items ---
 */

export const ResponseInputItemSchema = z.discriminatedUnion("type", [
  MessageItemUnionSchema,
  ResponseFunctionToolCallSchema,
  FunctionCallOutputSchema,
  ResponseReasoningItemSchema,
]);
export type ResponseInputItem = z.infer<typeof ResponseInputItemSchema>;
