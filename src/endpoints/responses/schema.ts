import * as z from "zod";

import type { SseErrorFrame, SseFrame } from "../../utils/stream";

export const ResponsesMetadataSchema = z
  .record(z.string().min(1).max(64), z.string().max(512))
  .nullable()
  .optional();
export type ResponsesMetadata = z.infer<typeof ResponsesMetadataSchema>;

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
  ResponsesInputAudioSchema,
]);
export type ResponsesInputContent = z.infer<typeof ResponsesInputContentSchema>;

export const ResponsesOutputTextSchema = z.object({
  type: z.literal("output_text"),
  text: z.string(),
  annotations: z.array(z.unknown()).optional(),
});
export type ResponsesOutputText = z.infer<typeof ResponsesOutputTextSchema>;

// Message Items

const ResponsesMessageItemBaseSchema = z.object({
  type: z.literal("message"),
  id: z.string().optional(),
  status: ResponsesItemStatusSchema.optional(),
  // Extension origin: Gemini
  extra_content: ResponsesProviderMetadataSchema.optional().meta({ extension: true }),
  // Extension origin: Anthropic/OpenRouter/Vercel
  cache_control: ResponsesCacheControlSchema.optional().meta({ extension: true }),
});

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

export const ResponsesFunctionCallSchema = z.object({
  type: z.literal("function_call"),
  id: z.string().optional(),
  call_id: z.string(),
  name: z.string(),
  arguments: z.string(),
  status: ResponsesItemStatusSchema.optional(),
  // Extension origin: Gemini
  extra_content: ResponsesProviderMetadataSchema.optional().meta({ extension: true }),
  // Extension origin: Anthropic/OpenRouter/Vercel
  cache_control: ResponsesCacheControlSchema.optional().meta({ extension: true }),
});
export type ResponsesFunctionCall = z.infer<typeof ResponsesFunctionCallSchema>;

export const ResponsesFunctionCallOutputSchema = z.object({
  type: z.literal("function_call_output"),
  id: z.string().optional(),
  call_id: z.string(),
  output: z.union([z.string(), z.array(ResponsesInputContentSchema)]),
  status: ResponsesItemStatusSchema.optional(),
  // Extension origin: Gemini
  extra_content: ResponsesProviderMetadataSchema.optional().meta({ extension: true }),
  // Extension origin: Anthropic/OpenRouter/Vercel
  cache_control: ResponsesCacheControlSchema.optional().meta({ extension: true }),
});
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

export const ResponsesReasoningItemSchema = z.object({
  type: z.literal("reasoning"),
  id: z.string().optional(),
  summary: z.array(ResponsesSummaryTextSchema),
  content: z.array(ResponsesReasoningTextSchema).optional(),
  encrypted_content: z.string().optional(),
  status: ResponsesItemStatusSchema.optional(),
  // Extension origin: Gemini
  extra_content: ResponsesProviderMetadataSchema.optional().meta({ extension: true }),
});
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

import {
  CacheControlSchema as ResponsesCacheControlSchema,
  ReasoningEffortSchema as ResponsesReasoningEffortSchema,
  ReasoningConfigSchema as ResponsesReasoningConfigSchema,
  ServiceTierSchema as ResponsesServiceTierSchema,
  ProviderMetadataSchema as ResponsesProviderMetadataSchema,
  type CacheControl as ResponsesCacheControl,
  type ReasoningEffort as ResponsesReasoningEffort,
  type ReasoningConfig as ResponsesReasoningConfig,
  type ServiceTier as ResponsesServiceTier,
  type ProviderMetadata as ResponsesProviderMetadata,
  ContentPartAudioSchema as ResponsesInputAudioSchema,
  type ContentPartAudio as ResponsesInputAudio,
} from "../shared/schema";

export {
  ResponsesCacheControlSchema,
  type ResponsesCacheControl,
  ResponsesReasoningEffortSchema,
  type ResponsesReasoningEffort,
  ResponsesReasoningConfigSchema,
  type ResponsesReasoningConfig,
  ResponsesServiceTierSchema,
  type ResponsesServiceTier,
  ResponsesProviderMetadataSchema,
  type ResponsesProviderMetadata,
  ResponsesInputAudioSchema,
  type ResponsesInputAudio,
};

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
  // verbosity: z.enum(["low", "medium", "high"]).optional(),
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
  reasoning: ResponsesReasoningConfigSchema.optional(),
  prompt_cache_key: z.string().optional(),
  metadata: ResponsesMetadataSchema,
  service_tier: ResponsesServiceTierSchema.optional(),
  parallel_tool_calls: z.boolean().optional(),

  // FUTURE: Open Responses API orchestration configurations
  // previous_response_id: z.string().optional(),
  // conversation: z.union([z.string(), z.object({ id: z.string() })]).optional(),
  // context_management: z.array(z.object({ type: z.literal("compaction"), compact_threshold: z.number().optional() })).optional(),
  // prompt: z.object({ id: z.string(), variables: z.record(z.any()).optional(), version: z.string().optional() }).optional(),
  // phase: z.enum(["commentary", "final_answer"]).optional(),
  // safety_identifier: z.string().optional(),
  // truncation: z.enum(["auto", "disabled"]).optional(),
  // store: z.boolean().optional(),
  // background: z.boolean().optional(),
  // top_logprobs: z.number().int().optional(),
  // include: z.array(z.string()).optional(),
  // stream_options: z.object({ include_obfuscation: z.boolean().optional() }).optional(),

  // Extension origin: OpenRouter/Vercel/Anthropic
  cache_control: ResponsesCacheControlSchema.optional().meta({ extension: true }),
  // Extension origin: OpenRouter
  reasoning_effort: ResponsesReasoningEffortSchema.optional().meta({ extension: true }),
  // Extension origin: Gemini extra_body
  extra_body: ResponsesProviderMetadataSchema.optional().meta({ extension: true }),
});
export type ResponsesInputs = z.infer<typeof ResponsesInputsSchema>;

export const ResponsesBodySchema = z.object({
  model: z.string(),
  stream: z.boolean().optional(),
  ...ResponsesInputsSchema.shape,
});
export type ResponsesBody = z.infer<typeof ResponsesBodySchema>;

/**
 * --- Output Items ---
 */

export const ResponsesOutputMessageSchema = z.object({
  type: z.literal("message"),
  id: z.string(),
  role: z.literal("assistant"),
  status: z.enum(["in_progress", "completed", "incomplete"]),
  content: z.array(ResponsesOutputTextSchema),
  // Extension origin: Gemini
  extra_content: ResponsesProviderMetadataSchema.optional().meta({ extension: true }),
});
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
  service_tier: ResponsesServiceTierSchema.optional(),
  metadata: ResponsesMetadataSchema,
  // Extension origin: Vercel AI Gateway
  provider_metadata: ResponsesProviderMetadataSchema.optional().meta({ extension: true }),
});
export type Responses = z.infer<typeof ResponsesSchema>;

/**
 * --- Stream Event Types ---
 */

export type ResponseCreatedEvent = SseFrame<
  { type: "response.created"; response: Responses },
  "response.created"
>;

export type ResponseInProgressEvent = SseFrame<
  { type: "response.in_progress"; response: Responses },
  "response.in_progress"
>;

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
    item_id: string;
    output_index: number;
    content_index: number;
    part: ResponsesOutputText;
  },
  "response.content_part.added"
>;

export type ResponseReasoningSummaryPartAddedEvent = SseFrame<
  {
    type: "response.reasoning_summary_part.added";
    item_id: string;
    output_index: number;
    summary_index: number;
    part: ResponsesSummaryText;
  },
  "response.reasoning_summary_part.added"
>;

export type ResponseOutputTextDeltaEvent = SseFrame<
  {
    type: "response.output_text.delta";
    item_id: string;
    output_index: number;
    content_index: number;
    delta: string;
  },
  "response.output_text.delta"
>;

export type ResponseReasoningSummaryTextDeltaEvent = SseFrame<
  {
    type: "response.reasoning_summary_text.delta";
    item_id: string;
    output_index: number;
    summary_index: number;
    delta: string;
  },
  "response.reasoning_summary_text.delta"
>;

export type ResponseContentPartDoneEvent = SseFrame<
  {
    type: "response.content_part.done";
    item_id: string;
    output_index: number;
    content_index: number;
    part: ResponsesOutputText;
  },
  "response.content_part.done"
>;

export type ResponseReasoningSummaryPartDoneEvent = SseFrame<
  {
    type: "response.reasoning_summary_part.done";
    item_id: string;
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

export type ResponseFunctionCallArgumentsDeltaEvent = SseFrame<
  {
    type: "response.function_call_arguments.delta";
    output_index: number;
    item_id: string;
    call_id: string;
    delta: string;
  },
  "response.function_call_arguments.delta"
>;

export type ResponseFunctionCallArgumentsDoneEvent = SseFrame<
  {
    type: "response.function_call_arguments.done";
    output_index: number;
    item_id: string;
    call_id: string;
    arguments: string;
  },
  "response.function_call_arguments.done"
>;

export type ResponseCompletedEvent = SseFrame<
  { type: "response.completed"; response: Responses },
  "response.completed"
>;

export type ResponseFailedEvent = SseFrame<
  { type: "response.failed"; response: Responses },
  "response.failed"
>;

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
  | ResponseFunctionCallArgumentsDeltaEvent
  | ResponseFunctionCallArgumentsDoneEvent
  | ResponseCompletedEvent
  | ResponseFailedEvent;

export type ResponsesStream = ReadableStream<ResponsesStreamEvent | SseErrorFrame>;
