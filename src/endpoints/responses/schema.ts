import * as z from "zod";

import type { SseErrorFrame, SseFrame } from "../../utils/stream";

// --- Shared ---

export const ResponsesCacheControlSchema = z.object({
  type: z.literal("ephemeral"),
  ttl: z.string().optional(),
});
export type ResponsesCacheControl = z.infer<typeof ResponsesCacheControlSchema>;

// --- Input Content Parts ---

export const ResponsesInputTextPartSchema = z.object({
  type: z.literal("input_text"),
  text: z.string(),
  cache_control: ResponsesCacheControlSchema.optional().meta({ extension: true }),
});

export const ResponsesInputImagePartSchema = z.object({
  type: z.literal("input_image"),
  image_url: z.string(),
  detail: z.enum(["low", "high", "auto"]).optional(),
  cache_control: ResponsesCacheControlSchema.optional().meta({ extension: true }),
});

export const ResponsesInputFilePartSchema = z.object({
  type: z.literal("input_file"),
  file_data: z.string(),
  filename: z.string().optional(),
  // Not in upstream spec; needed by the AI SDK to choose the right codec.
  media_type: z.string().optional(),
  cache_control: ResponsesCacheControlSchema.optional().meta({ extension: true }),
});

export const ResponsesInputAudioPartSchema = z.object({
  type: z.literal("input_audio"),
  data: z.string(),
  format: z.enum([
    "x-aac",
    "flac",
    "mp3",
    "m4a",
    "mpeg",
    "mpga",
    "mp4",
    "ogg",
    "pcm",
    "wav",
    "webm",
  ]),
  cache_control: ResponsesCacheControlSchema.optional().meta({ extension: true }),
});

export const ResponsesOutputTextInputPartSchema = z.object({
  type: z.literal("output_text"),
  text: z.string(),
  annotations: z.array(z.unknown()).optional(),
});

export const ResponsesInputContentPartSchema = z.discriminatedUnion("type", [
  ResponsesInputTextPartSchema,
  ResponsesInputImagePartSchema,
  ResponsesInputFilePartSchema,
  ResponsesInputAudioPartSchema,
  ResponsesOutputTextInputPartSchema,
]);
export type ResponsesInputContentPart = z.infer<typeof ResponsesInputContentPartSchema>;

// --- Input Items ---

const ResponsesEasyInputMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system", "developer"]),
  content: z.union([z.string(), z.array(ResponsesInputContentPartSchema)]),
  cache_control: ResponsesCacheControlSchema.optional().meta({ extension: true }),
});

export const ResponsesInputMessageItemSchema = z.object({
  type: z.literal("message"),
  role: z.enum(["user", "assistant", "system", "developer"]),
  content: z.union([z.string(), z.array(ResponsesInputContentPartSchema)]),
  cache_control: ResponsesCacheControlSchema.optional().meta({ extension: true }),
});

export const ResponsesFunctionCallInputItemSchema = z.object({
  type: z.literal("function_call"),
  id: z.string().optional(),
  call_id: z.string(),
  name: z.string(),
  arguments: z.string(),
  status: z.enum(["in_progress", "completed", "incomplete"]).optional(),
});

export const ResponsesFunctionCallOutputItemSchema = z.object({
  type: z.literal("function_call_output"),
  call_id: z.string(),
  output: z.string(),
});

const ResponsesTypedInputItemSchema = z.discriminatedUnion("type", [
  ResponsesInputMessageItemSchema,
  ResponsesFunctionCallInputItemSchema,
  ResponsesFunctionCallOutputItemSchema,
]);

export const ResponsesInputItemSchema = z.union([
  ResponsesTypedInputItemSchema,
  ResponsesEasyInputMessageSchema,
]);
export type ResponsesInputItem = z.infer<typeof ResponsesInputItemSchema>;

// --- Tools ---

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

// --- Text Output Format ---

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

// --- Reasoning ---

export const ResponsesReasoningEffortSchema = z.enum([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
]);
export type ResponsesReasoningEffort = z.infer<typeof ResponsesReasoningEffortSchema>;

export const ResponsesReasoningConfigSchema = z.object({
  effort: ResponsesReasoningEffortSchema.optional(),
  summary: z.enum(["auto", "concise", "detailed"]).optional(),
  // Extension origin: OpenRouter
  enabled: z.boolean().optional().meta({ extension: true }),
  max_tokens: z.number().optional().meta({ extension: true }),
  exclude: z.boolean().optional().meta({ extension: true }),
});
export type ResponsesReasoningConfig = z.infer<typeof ResponsesReasoningConfigSchema>;

// --- Metadata & Service Tier ---

export const ResponsesMetadataSchema = z.record(z.string().min(1).max(64), z.string().max(512));
export type ResponsesMetadata = z.infer<typeof ResponsesMetadataSchema>;

export const ResponsesServiceTierSchema = z.enum(["auto", "default", "flex", "scale", "priority"]);
export type ResponsesServiceTier = z.infer<typeof ResponsesServiceTierSchema>;

// --- Request Body ---

const ResponsesInputsSchema = z.object({
  input: z.union([z.string(), z.array(ResponsesInputItemSchema)]),
  instructions: z.string().optional(),
  tools: z.array(ResponsesToolSchema).optional(),
  tool_choice: ResponsesToolChoiceSchema.optional(),
  max_tool_calls: z.int().nonnegative().optional(),
  text: ResponsesTextConfigSchema.optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1.0).optional(),
  frequency_penalty: z.number().min(-2.0).max(2.0).optional(),
  presence_penalty: z.number().min(-2.0).max(2.0).optional(),
  max_output_tokens: z.int().nonnegative().optional(),
  reasoning: ResponsesReasoningConfigSchema.optional(),
  prompt_cache_key: z.string().optional(),
  metadata: ResponsesMetadataSchema.optional(),
  service_tier: ResponsesServiceTierSchema.optional(),
  // Extension origin: OpenRouter/Vercel/Anthropic
  cache_control: ResponsesCacheControlSchema.optional().meta({ extension: true }),
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

// --- Output Content Parts ---

export const ResponsesOutputTextPartSchema = z.object({
  type: z.literal("output_text"),
  text: z.string(),
  annotations: z.array(z.unknown()).optional(),
});
export type ResponsesOutputTextPart = z.infer<typeof ResponsesOutputTextPartSchema>;

// --- Output Items ---

export const ResponsesReasoningDetailSchema = z.object({
  id: z.string().optional(),
  index: z.int().nonnegative(),
  type: z.string(),
  text: z.string().optional(),
  signature: z.string().optional(),
  data: z.string().optional(),
  summary: z.string().optional(),
  format: z.string().optional(),
});
export type ResponsesReasoningDetail = z.infer<typeof ResponsesReasoningDetailSchema>;

export const ResponsesMessageOutputItemSchema = z.object({
  type: z.literal("message"),
  id: z.string(),
  role: z.literal("assistant"),
  status: z.enum(["in_progress", "completed", "incomplete"]),
  content: z.array(ResponsesOutputTextPartSchema),
  // Extension origin: OpenRouter/Vercel
  reasoning_details: z.array(ResponsesReasoningDetailSchema).optional().meta({ extension: true }),
  // Extension origin: Gemini
  extra_content: z
    .record(z.string(), z.record(z.string(), z.unknown()))
    .optional()
    .meta({ extension: true }),
});
export type ResponsesMessageOutputItem = z.infer<typeof ResponsesMessageOutputItemSchema>;

export const ResponsesFunctionCallOutputSchema = z.object({
  type: z.literal("function_call"),
  id: z.string(),
  call_id: z.string(),
  name: z.string(),
  arguments: z.string(),
  status: z.enum(["in_progress", "completed", "incomplete"]),
  // Extension origin: Gemini
  extra_content: z
    .record(z.string(), z.record(z.string(), z.unknown()))
    .optional()
    .meta({ extension: true }),
});
export type ResponsesFunctionCallOutput = z.infer<typeof ResponsesFunctionCallOutputSchema>;

export const ResponsesReasoningOutputItemSchema = z.object({
  type: z.literal("reasoning"),
  id: z.string(),
  summary: z
    .array(
      z.object({
        type: z.literal("summary_text"),
        text: z.string(),
      }),
    )
    .optional(),
});
export type ResponsesReasoningOutputItem = z.infer<typeof ResponsesReasoningOutputItemSchema>;

export const ResponsesOutputItemSchema = z.discriminatedUnion("type", [
  ResponsesMessageOutputItemSchema,
  ResponsesFunctionCallOutputSchema,
  ResponsesReasoningOutputItemSchema,
]);
export type ResponsesOutputItem = z.infer<typeof ResponsesOutputItemSchema>;

// --- Usage ---

export const ResponsesUsageSchema = z.object({
  input_tokens: z.int().nonnegative().optional(),
  output_tokens: z.int().nonnegative().optional(),
  total_tokens: z.int().nonnegative().optional(),
  output_tokens_details: z
    .object({
      reasoning_tokens: z.int().nonnegative().optional(),
    })
    .optional(),
  input_tokens_details: z
    .object({
      cached_tokens: z.int().nonnegative().optional(),
      // Extension origin: OpenRouter
      cache_write_tokens: z.int().nonnegative().optional().meta({ extension: true }),
    })
    .optional(),
});
export type ResponsesUsage = z.infer<typeof ResponsesUsageSchema>;

// --- Response ---

export const ResponsesStatusSchema = z.enum(["completed", "failed", "incomplete", "in_progress"]);
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
  created_at: z.int().nonnegative(),
  completed_at: z.int().nonnegative().nullable().optional(),
  service_tier: ResponsesServiceTierSchema.optional(),
  // Extension origin: Vercel AI Gateway
  provider_metadata: z
    .record(z.string(), z.record(z.string(), z.unknown()))
    .optional()
    .meta({ extension: true }),
});
export type ResponsesResponse = z.infer<typeof ResponsesSchema>;

// --- Stream Chunks ---

export type ResponsesStreamEvent =
  | { type: "response.created"; response: ResponsesResponse }
  | { type: "response.in_progress"; response: ResponsesResponse }
  | {
      type: "response.output_item.added";
      output_index: number;
      item: ResponsesOutputItem;
    }
  | {
      type: "response.content_part.added";
      item_id: string;
      output_index: number;
      content_index: number;
      part: ResponsesOutputTextPart;
    }
  | {
      type: "response.output_text.delta";
      item_id: string;
      output_index: number;
      content_index: number;
      delta: string;
    }
  | {
      type: "response.output_text.done";
      item_id: string;
      output_index: number;
      content_index: number;
      text: string;
    }
  | {
      type: "response.function_call_arguments.delta";
      item_id: string;
      output_index: number;
      delta: string;
    }
  | {
      type: "response.function_call_arguments.done";
      item_id: string;
      output_index: number;
      arguments: string;
    }
  | {
      type: "response.content_part.done";
      item_id: string;
      output_index: number;
      content_index: number;
      part: ResponsesOutputTextPart;
    }
  | {
      type: "response.output_item.done";
      output_index: number;
      item: ResponsesOutputItem;
    }
  | { type: "response.completed"; response: ResponsesResponse }
  | { type: "response.failed"; response: ResponsesResponse };

export type ResponsesStream = ReadableStream<SseFrame<ResponsesStreamEvent> | SseErrorFrame>;
