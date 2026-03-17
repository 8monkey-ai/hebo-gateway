import * as z from "zod";

/**
 * Shared Open Responses item schemas used by both /conversations and /responses.
 */

/**
 * --- Metadata ---
 */

// Note: The 16-key limit is not currently validated.
export const CacheControlSchema = z.object({
  type: z.literal("ephemeral"),
  ttl: z.string().optional(),
});
export type CacheControl = z.infer<typeof CacheControlSchema>;

export const ReasoningEffortSchema = z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]);
export type ReasoningEffort = z.infer<typeof ReasoningEffortSchema>;

export const ReasoningConfigSchema = z.object({
  enabled: z.optional(z.boolean()),
  effort: z.optional(ReasoningEffortSchema),
  max_tokens: z.optional(z.number()),
  exclude: z.optional(z.boolean()),
});
export type ReasoningConfig = z.infer<typeof ReasoningConfigSchema>;

export const ServiceTierSchema = z.enum(["auto", "default", "flex", "scale", "priority"]);
export type ServiceTier = z.infer<typeof ServiceTierSchema>;

export const MetadataSchema = z
  .record(z.string().max(64), z.string().max(512))
  .nullable()
  .optional();
export type Metadata = z.infer<typeof MetadataSchema>;

export const ResponsesItemStatusSchema = z.enum(["in_progress", "completed", "incomplete"]);
export type ResponsesItemStatus = z.infer<typeof ResponsesItemStatusSchema>;

export const ResponsesImageDetailSchema = z.enum(["low", "high", "auto"]);
export type ResponsesImageDetail = z.infer<typeof ResponsesImageDetailSchema>;

/**
 * --- Messaging Content & Items ---
 */

// Content Parts

export const ResponsesInputTextSchema = z.object({
  type: z.literal("input_text"),
  text: z.string(),
});
export type ResponsesInputText = z.infer<typeof ResponsesInputTextSchema>;

const ResponsesInputImageURLSchema = z.object({
  type: z.literal("input_image"),
  image_url: z.string(),
  file_id: z.string().optional(),
  detail: ResponsesImageDetailSchema.optional(),
});

const ResponsesInputImageIDSchema = z.object({
  type: z.literal("input_image"),
  file_id: z.string(),
  image_url: z.string().optional(),
  detail: ResponsesImageDetailSchema.optional(),
});

export const ResponsesInputImageSchema = z.union([
  ResponsesInputImageURLSchema,
  ResponsesInputImageIDSchema,
]);
export type ResponsesInputImage = z.infer<typeof ResponsesInputImageSchema>;

const ResponsesInputFileDataSchema = z.object({
  type: z.literal("input_file"),
  file_data: z.string(),
  file_id: z.string().optional(),
  file_url: z.string().optional(),
  filename: z.string().optional(),
});

const ResponsesInputFileIDSchema = z.object({
  type: z.literal("input_file"),
  file_id: z.string(),
  file_data: z.string().optional(),
  file_url: z.string().optional(),
  filename: z.string().optional(),
});

const ResponsesInputFileURLSchema = z.object({
  type: z.literal("input_file"),
  file_url: z.string(),
  file_data: z.string().optional(),
  file_id: z.string().optional(),
  filename: z.string().optional(),
});

export const ResponsesInputFileSchema = z.union([
  ResponsesInputFileDataSchema,
  ResponsesInputFileIDSchema,
  ResponsesInputFileURLSchema,
]);
export type ResponsesInputFile = z.infer<typeof ResponsesInputFileSchema>;

export const ResponsesInputContentSchema = z.union([
  ResponsesInputTextSchema,
  ResponsesInputImageURLSchema,
  ResponsesInputImageIDSchema,
  ResponsesInputFileDataSchema,
  ResponsesInputFileIDSchema,
  ResponsesInputFileURLSchema,
]);
export type ResponsesInputContent = z.infer<typeof ResponsesInputContentSchema>;

export const ResponsesOutputTextSchema = z.object({
  type: z.literal("output_text"),
  text: z.string(),
  annotations: z.array(z.unknown()).optional(),
});
export type ResponsesOutputText = z.infer<typeof ResponsesOutputTextSchema>;

// Message Items

const ResponsesMessageItemBaseSchema = z
  .object({
    type: z.literal("message"),
    id: z.string().optional(),
    status: ResponsesItemStatusSchema.optional(),
  })
  .loose();

const ResponsesUserMessageSchema = ResponsesMessageItemBaseSchema.extend({
  role: z.literal("user"),
  content: z.union([z.string(), z.array(ResponsesInputContentSchema)]),
});

const ResponsesAssistantMessageSchema = ResponsesMessageItemBaseSchema.extend({
  role: z.literal("assistant"),
  content: z.union([z.string(), z.array(ResponsesOutputTextSchema)]),
});

const ResponsesSystemMessageSchema = ResponsesMessageItemBaseSchema.extend({
  role: z.literal("system"),
  content: z.union([z.string(), z.array(ResponsesInputContentSchema)]),
});

const ResponsesDeveloperMessageSchema = ResponsesMessageItemBaseSchema.extend({
  role: z.literal("developer"),
  content: z.union([z.string(), z.array(ResponsesInputContentSchema)]),
});

export const ResponsesMessageItemSchema = z.discriminatedUnion("role", [
  ResponsesUserMessageSchema,
  ResponsesAssistantMessageSchema,
  ResponsesSystemMessageSchema,
  ResponsesDeveloperMessageSchema,
]);
export type ResponsesMessageItem = z.infer<typeof ResponsesMessageItemSchema>;

/**
 * --- Function ---
 */

export const ResponsesFunctionCallSchema = z
  .object({
    type: z.literal("function_call"),
    id: z.string().optional(),
    call_id: z.string(),
    name: z.string(),
    arguments: z.string(),
    status: ResponsesItemStatusSchema.optional(),
  })
  .loose();
export type ResponsesFunctionCall = z.infer<typeof ResponsesFunctionCallSchema>;

export const ResponsesFunctionCallOutputSchema = z
  .object({
    type: z.literal("function_call_output"),
    id: z.string().optional(),
    call_id: z.string(),
    output: z.union([z.string(), z.array(ResponsesInputContentSchema)]),
    status: ResponsesItemStatusSchema.optional(),
  })
  .loose();
export type ResponsesFunctionCallOutput = z.infer<typeof ResponsesFunctionCallOutputSchema>;

/**
 * --- Reasoning ---
 */

export const ResponsesSummaryTextSchema = z.object({
  type: z.literal("summary_text"),
  text: z.string(),
});
export type ResponsesSummaryText = z.infer<typeof ResponsesSummaryTextSchema>;

export const ResponsesReasoningTextSchema = z.object({
  type: z.literal("reasoning_text"),
  text: z.string(),
});
export type ResponsesReasoningText = z.infer<typeof ResponsesReasoningTextSchema>;

export const ResponsesReasoningItemSchema = z
  .object({
    type: z.literal("reasoning"),
    id: z.string().optional(),
    summary: z.array(ResponsesSummaryTextSchema),
    content: z.array(ResponsesReasoningTextSchema).optional(),
    encrypted_content: z.string().optional(),
    status: ResponsesItemStatusSchema.optional(),
  })
  .loose();
export type ResponsesReasoningItem = z.infer<typeof ResponsesReasoningItemSchema>;

/**
 * --- Input Items ---
 */

export const ResponsesInputItemSchema = z.discriminatedUnion("type", [
  ResponsesMessageItemSchema,
  ResponsesFunctionCallSchema,
  ResponsesFunctionCallOutputSchema,
  ResponsesReasoningItemSchema,
]);
export type ResponsesInputItem = z.infer<typeof ResponsesInputItemSchema>;
