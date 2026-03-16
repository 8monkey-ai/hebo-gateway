import * as z from "zod";

import type { SseErrorFrame, SseFrame } from "../../utils/stream";

import {
  MetadataSchema,
  ResponseInputItemSchema,
  ResponseOutputTextSchema,
  ResponseFunctionToolCallSchema,
  ResponseReasoningItemSchema,
  type ResponseOutputText,
} from "../shared/schema";

export {
  MetadataSchema,
  type Metadata,
  ItemStatusSchema,
  type ItemStatus,
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

import {
  CacheControlSchema,
  ReasoningEffortSchema,
  ReasoningConfigSchema,
  ServiceTierSchema,
  type CacheControl,
  type ReasoningEffort,
  type ReasoningConfig,
  type ServiceTier,
} from "../shared/schema";

export type { CacheControl, ReasoningEffort, ReasoningConfig, ServiceTier };

/**
 * --- Tools ---
 */

export const ResponsesToolSchema = z.object({
  type: z.literal("function"),
  name: z.string(),
  description: z.string().optional(),
  parameters: z.record(z.string(), z.unknown()),
  strict: z.boolean().optional(),
});
export type ResponsesTool = z.infer<typeof ResponsesToolSchema>;

const ResponsesNamedFunctionToolChoiceSchema = z.object({
  type: z.literal("function"),
  name: z.string(),
});

export const ResponsesToolChoiceSchema = z.union([
  z.enum(["none", "auto", "required"]),
  ResponsesNamedFunctionToolChoiceSchema,
]);
export type ResponsesToolChoice = z.infer<typeof ResponsesToolChoiceSchema>;

/**
 * --- Text Output Config ---
 */

export const ResponsesTextFormatJsonSchema = z.object({
  type: z.literal("json_schema"),
  name: z.string(),
  description: z.string().optional(),
  schema: z.record(z.string(), z.unknown()),
  strict: z.boolean().optional(),
});

export const ResponsesTextFormatTextSchema = z.object({
  type: z.literal("text"),
});

export const ResponsesTextFormatSchema = z.discriminatedUnion("type", [
  ResponsesTextFormatJsonSchema,
  ResponsesTextFormatTextSchema,
]);

export const ResponsesTextConfigSchema = z.object({
  format: ResponsesTextFormatSchema.optional(),
});
export type ResponsesTextConfig = z.infer<typeof ResponsesTextConfigSchema>;

/**
 * --- Request Body ---
 */

const ResponsesInputsSchema = z.object({
  input: z.union([z.string(), z.array(ResponseInputItemSchema)]),
  instructions: z.string().optional(),
  tools: z.array(ResponsesToolSchema).optional(),
  tool_choice: ResponsesToolChoiceSchema.optional(),
  max_tool_calls: z.number().int().optional(),
  text: ResponsesTextConfigSchema.optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1.0).optional(),
  frequency_penalty: z.number().min(-2.0).max(2.0).optional(),
  presence_penalty: z.number().min(-2.0).max(2.0).optional(),
  max_output_tokens: z.number().int().nonnegative().optional(),
  reasoning: ReasoningConfigSchema.optional(),
  prompt_cache_key: z.string().optional(),
  metadata: MetadataSchema,
  service_tier: ServiceTierSchema.optional(),
  // Extension origin: OpenRouter/Vercel/Anthropic
  cache_control: CacheControlSchema.optional().meta({ extension: true }),
  // Extension origin: OpenRouter
  reasoning_effort: ReasoningEffortSchema.optional().meta({ extension: true }),
  // Extension origin: Gemini extra_body
  extra_body: z
    .record(z.string(), z.record(z.string(), z.unknown()))
    .optional()
    .meta({ extension: true }),
});
export type ResponsesInputs = z.infer<typeof ResponsesInputsSchema>;

export const ResponsesBodySchema = z.looseObject({
  model: z.string(),
  stream: z.boolean().optional(),
  ...ResponsesInputsSchema.shape,
});
export type ResponsesBody = z.infer<typeof ResponsesBodySchema>;

/**
 * --- Output Items ---
 */

export const ResponseOutputMessageSchema = z
  .object({
    type: z.literal("message"),
    id: z.string(),
    role: z.literal("assistant"),
    status: z.enum(["in_progress", "completed", "incomplete"]),
    content: z.array(ResponseOutputTextSchema),
  })
  .loose();
export type ResponseOutputMessage = z.infer<typeof ResponseOutputMessageSchema>;

export const ResponseOutputItemSchema = z.discriminatedUnion("type", [
  ResponseOutputMessageSchema,
  ResponseFunctionToolCallSchema,
  ResponseReasoningItemSchema,
]);
export type ResponseOutputItem = z.infer<typeof ResponseOutputItemSchema>;

/**
 * --- Response Usage ---
 */

export const ResponsesUsageSchema = z.object({
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
  input_tokens_details: z
    .object({
      cached_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
  output_tokens_details: z
    .object({
      reasoning_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});
export type ResponsesUsage = z.infer<typeof ResponsesUsageSchema>;

/**
 * --- Response Object ---
 */

export const ResponsesStatusSchema = z.enum(["completed", "failed", "incomplete"]);
export type ResponsesStatus = z.infer<typeof ResponsesStatusSchema>;

export const ResponsesSchema = z.object({
  id: z.string(),
  object: z.literal("response"),
  status: ResponsesStatusSchema,
  model: z.string(),
  output: z.array(ResponseOutputItemSchema),
  usage: ResponsesUsageSchema.nullable(),
  incomplete_details: z
    .object({
      reason: z.string(),
    })
    .nullable()
    .optional(),
  created_at: z.number().int(),
  completed_at: z.number().int().nullable(),
  service_tier: ServiceTierSchema.optional(),
  metadata: MetadataSchema,
  // Extension origin: Vercel AI Gateway
  provider_metadata: z
    .record(z.string(), z.record(z.string(), z.unknown()))
    .optional()
    .meta({ extension: true }),
});
export type Responses = z.infer<typeof ResponsesSchema>;

/**
 * --- Stream Event Types ---
 */

export type ResponsesStreamEvent =
  | SseFrame<Responses, "response.created">
  | SseFrame<Responses, "response.in_progress">
  | SseFrame<
      {
        type: "response.output_item.added";
        output_index: number;
        item: ResponseOutputItem;
      },
      "response.output_item.added"
    >
  | SseFrame<
      {
        type: "response.content_part.added";
        output_index: number;
        content_index: number;
        part: ResponseOutputText;
      },
      "response.content_part.added"
    >
  | SseFrame<
      {
        type: "response.output_text.delta";
        output_index: number;
        content_index: number;
        delta: string;
      },
      "response.output_text.delta"
    >
  | SseFrame<
      {
        type: "response.content_part.done";
        output_index: number;
        content_index: number;
        part: ResponseOutputText;
      },
      "response.content_part.done"
    >
  | SseFrame<
      {
        type: "response.output_item.done";
        output_index: number;
        item: ResponseOutputItem;
      },
      "response.output_item.done"
    >
  | SseFrame<Responses, "response.completed">
  | SseFrame<Responses, "response.failed">;

export type ResponsesStream = ReadableStream<ResponsesStreamEvent | SseErrorFrame>;
