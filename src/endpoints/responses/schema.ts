import * as z from "zod";

import type { SseErrorFrame, SseFrame } from "../../utils/stream";

import {
  MetadataSchema,
  ResponsesInputItemSchema,
  ResponsesOutputTextSchema,
  ResponsesFunctionCallSchema,
  ResponsesReasoningItemSchema,
  type ResponsesOutputText,
  type ResponsesSummaryText,
} from "../shared/schema";

export {
  MetadataSchema,
  type Metadata,
  ResponsesItemStatusSchema,
  type ResponsesItemStatus,
  ResponsesInputTextSchema,
  type ResponsesInputText,
  ResponsesInputImageSchema,
  type ResponsesInputImage,
  ResponsesInputFileSchema,
  type ResponsesInputFile,
  ResponsesInputContentSchema,
  type ResponsesInputContent,
  ResponsesOutputTextSchema,
  type ResponsesOutputText,
  ResponsesMessageItemSchema,
  type ResponsesMessageItem,
  ResponsesFunctionCallSchema,
  type ResponsesFunctionCall,
  ResponsesFunctionCallOutputSchema,
  type ResponsesFunctionCallOutput,
  ResponsesSummaryTextSchema,
  type ResponsesSummaryText,
  ResponsesReasoningTextSchema,
  type ResponsesReasoningText,
  ResponsesReasoningItemSchema,
  type ResponsesReasoningItem,
  ResponsesInputItemSchema,
  type ResponsesInputItem,
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

const ResponsesAllowedFunctionToolChoiceSchema = z.object({
  type: z.literal("allowed_tools"),
  allowed_tools: z.object({
    mode: z.enum(["none", "auto", "required"]),
    tools: z.array(ResponsesNamedFunctionToolChoiceSchema).nonempty(),
  }),
});

export const ResponsesToolChoiceSchema = z.union([
  z.enum(["none", "auto", "required", "validated"]),
  ResponsesNamedFunctionToolChoiceSchema,
  ResponsesAllowedFunctionToolChoiceSchema,
]);
export type ResponsesToolChoice = z.infer<typeof ResponsesToolChoiceSchema>;

/**
 * --- Text Output Config ---
 */

export const ResponsesTextFormatJsonSchema = z.object({
  // FUTURE: Consider support for legacy json_object (if demand)
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
  // FUTURE: Support verbosity configuration
  verbosity: z.enum(["low", "medium", "high"]).optional(),
});
export type ResponsesTextConfig = z.infer<typeof ResponsesTextConfigSchema>;

/**
 * --- Request Body ---
 */

const ResponsesInputsSchema = z.object({
  input: z.union([z.string(), z.array(ResponsesInputItemSchema)]),
  instructions: z.string().optional(),
  tools: z.array(ResponsesToolSchema).optional(),
  tool_choice: ResponsesToolChoiceSchema.optional(),
  max_tool_calls: z.number().int().nonnegative().optional(),
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
  parallel_tool_calls: z.boolean().optional(),

  // FUTURE: Open Responses API orchestration configurations
  // previous_response_id: z.string().optional(),
  // safety_identifier: z.string().optional(),
  // truncation: z.enum(["auto", "disabled"]).optional(),
  // store: z.boolean().optional(),
  // background: z.boolean().optional(),
  // top_logprobs: z.number().int().optional(),
  // include: z.array(z.string()).optional(),
  // stream_options: z.object({ include_obfuscation: z.boolean().optional() }).optional(),

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

export const ResponsesOutputMessageSchema = z
  .object({
    type: z.literal("message"),
    id: z.string(),
    role: z.literal("assistant"),
    status: z.enum(["in_progress", "completed", "incomplete"]),
    content: z.array(ResponsesOutputTextSchema),
  })
  .loose();
export type ResponsesOutputMessage = z.infer<typeof ResponsesOutputMessageSchema>;

export const ResponsesOutputItemSchema = z.discriminatedUnion("type", [
  ResponsesOutputMessageSchema,
  ResponsesFunctionCallSchema,
  ResponsesReasoningItemSchema,
]);
export type ResponsesOutputItem = z.infer<typeof ResponsesOutputItemSchema>;

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

export const ResponsesStatusSchema = z.enum(["in_progress", "completed", "failed", "incomplete"]);
export type ResponsesStatus = z.infer<typeof ResponsesStatusSchema>;

export const ResponsesSchema = z.object({
  id: z.string(),
  object: z.literal("response"),
  status: ResponsesStatusSchema,
  model: z.string(),
  output: z.array(ResponsesOutputItemSchema),
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

export type ResponseCreatedEvent = SseFrame<Responses, "response.created">;

export type ResponseInProgressEvent = SseFrame<Responses, "response.in_progress">;

export type ResponseOutputItemAddedEvent = SseFrame<
  {
    type: "response.output_item.added";
    output_index: number;
    item: ResponsesOutputItem;
  },
  "response.output_item.added"
>;

export type ResponseContentPartAddedEvent = SseFrame<
  {
    type: "response.content_part.added";
    output_index: number;
    content_index: number;
    part: ResponsesOutputText;
  },
  "response.content_part.added"
>;

export type ResponseReasoningSummaryPartAddedEvent = SseFrame<
  {
    type: "response.reasoning_summary_part.added";
    output_index: number;
    summary_index: number;
    part: ResponsesSummaryText;
  },
  "response.reasoning_summary_part.added"
>;

export type ResponseOutputTextDeltaEvent = SseFrame<
  {
    type: "response.output_text.delta";
    output_index: number;
    content_index: number;
    delta: string;
  },
  "response.output_text.delta"
>;

export type ResponseReasoningSummaryTextDeltaEvent = SseFrame<
  {
    type: "response.reasoning_summary_text.delta";
    output_index: number;
    summary_index: number;
    delta: string;
  },
  "response.reasoning_summary_text.delta"
>;

export type ResponseContentPartDoneEvent = SseFrame<
  {
    type: "response.content_part.done";
    output_index: number;
    content_index: number;
    part: ResponsesOutputText;
  },
  "response.content_part.done"
>;

export type ResponseReasoningSummaryPartDoneEvent = SseFrame<
  {
    type: "response.reasoning_summary_part.done";
    output_index: number;
    summary_index: number;
    part: ResponsesSummaryText;
  },
  "response.reasoning_summary_part.done"
>;

export type ResponseOutputItemDoneEvent = SseFrame<
  {
    type: "response.output_item.done";
    output_index: number;
    item: ResponsesOutputItem;
  },
  "response.output_item.done"
>;

export type ResponseCompletedEvent = SseFrame<Responses, "response.completed">;

export type ResponseFailedEvent = SseFrame<Responses, "response.failed">;

export type ResponsesStreamEvent =
  | ResponseCreatedEvent
  | ResponseInProgressEvent
  | ResponseOutputItemAddedEvent
  | ResponseContentPartAddedEvent
  | ResponseReasoningSummaryPartAddedEvent
  | ResponseOutputTextDeltaEvent
  | ResponseReasoningSummaryTextDeltaEvent
  | ResponseContentPartDoneEvent
  | ResponseReasoningSummaryPartDoneEvent
  | ResponseOutputItemDoneEvent
  | ResponseCompletedEvent
  | ResponseFailedEvent;

export type ResponsesStream = ReadableStream<ResponsesStreamEvent | SseErrorFrame>;
