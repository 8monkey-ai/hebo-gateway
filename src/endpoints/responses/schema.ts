import * as z from "zod";

export const ResponsesCacheControlSchema = z.object({
  type: z.literal("ephemeral"),
  ttl: z.string().optional(),
});
export type ResponsesCacheControl = z.infer<typeof ResponsesCacheControlSchema>;

export const ResponsesInputTextPartSchema = z.object({
  type: z.literal("input_text"),
  text: z.string(),
  // Extension origin: OpenRouter/Vercel/Anthropic
  cache_control: ResponsesCacheControlSchema.optional().meta({ extension: true }),
});
export type ResponsesInputTextPart = z.infer<typeof ResponsesInputTextPartSchema>;

export const ResponsesInputImagePartSchema = z.object({
  type: z.literal("input_image"),
  image_url: z.string(),
  detail: z.enum(["low", "high", "auto"]).optional(),
  // Extension origin: OpenRouter/Vercel/Anthropic
  cache_control: ResponsesCacheControlSchema.optional().meta({ extension: true }),
});
export type ResponsesInputImagePart = z.infer<typeof ResponsesInputImagePartSchema>;

export const ResponsesInputFilePartSchema = z.object({
  type: z.literal("input_file"),
  file_data: z.string().optional(),
  file_url: z.string().optional(),
  filename: z.string().optional(),
  // Extension origin: OpenRouter/Vercel/Anthropic
  cache_control: ResponsesCacheControlSchema.optional().meta({ extension: true }),
});
export type ResponsesInputFilePart = z.infer<typeof ResponsesInputFilePartSchema>;

export const ResponsesInputAudioPartSchema = z.object({
  // Extension origin: OpenRouter/Vercel
  type: z.literal("input_audio").meta({ extension: true }),
  input_audio: z.object({
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
  }),
  cache_control: ResponsesCacheControlSchema.optional().meta({ extension: true }),
});
export type ResponsesInputAudioPart = z.infer<typeof ResponsesInputAudioPartSchema>;

export const ResponsesInputContentPartSchema = z.discriminatedUnion("type", [
  ResponsesInputTextPartSchema,
  ResponsesInputImagePartSchema,
  ResponsesInputFilePartSchema,
  ResponsesInputAudioPartSchema,
]);
export type ResponsesInputContentPart = z.infer<typeof ResponsesInputContentPartSchema>;

export const ResponsesToolCallSchema = z.object({
  type: z.literal("function"),
  id: z.string(),
  function: z.object({
    arguments: z.string(),
    name: z.string(),
  }),
  // Extension origin: Gemini
  extra_content: z
    .record(z.string(), z.record(z.string(), z.unknown()))
    .optional()
    .meta({ extension: true }),
});
export type ResponsesToolCall = z.infer<typeof ResponsesToolCallSchema>;

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

const ResponsesInputItemStatusSchema = z.enum(["in_progress", "completed", "incomplete"]);

const ResponsesInputMessageBaseSchema = z.object({
  type: z.literal("message"),
  id: z.string().optional(),
  status: ResponsesInputItemStatusSchema.optional(),
  // Extension parity
  name: z.string().optional().meta({ extension: true }),
  cache_control: ResponsesCacheControlSchema.optional().meta({ extension: true }),
});

export const ResponsesInputSystemMessageItemSchema = ResponsesInputMessageBaseSchema.extend({
  role: z.literal("system"),
  content: z.string(),
});
export type ResponsesInputSystemMessageItem = z.infer<typeof ResponsesInputSystemMessageItemSchema>;

export const ResponsesInputDeveloperMessageItemSchema = ResponsesInputMessageBaseSchema.extend({
  role: z.literal("developer"),
  content: z.string(),
});
export type ResponsesInputDeveloperMessageItem = z.infer<
  typeof ResponsesInputDeveloperMessageItemSchema
>;

export const ResponsesInputUserMessageItemSchema = ResponsesInputMessageBaseSchema.extend({
  role: z.literal("user"),
  content: z.union([z.string(), z.array(ResponsesInputContentPartSchema)]),
});
export type ResponsesInputUserMessageItem = z.infer<typeof ResponsesInputUserMessageItemSchema>;

export const ResponsesInputAssistantMessageItemSchema = ResponsesInputMessageBaseSchema.extend({
  role: z.literal("assistant"),
  content: z.union([z.string(), z.null(), z.array(ResponsesInputTextPartSchema)]).optional(),
  tool_calls: z.array(ResponsesToolCallSchema).optional().meta({ extension: true }),
  reasoning_content: z.string().optional().meta({ extension: true }),
  reasoning_details: z.array(ResponsesReasoningDetailSchema).optional().meta({ extension: true }),
  extra_content: z
    .record(z.string(), z.record(z.string(), z.unknown()))
    .optional()
    .meta({ extension: true }),
});
export type ResponsesInputAssistantMessageItem = z.infer<
  typeof ResponsesInputAssistantMessageItemSchema
>;

export const ResponsesInputMessageItemSchema = z.discriminatedUnion("role", [
  ResponsesInputSystemMessageItemSchema,
  ResponsesInputDeveloperMessageItemSchema,
  ResponsesInputUserMessageItemSchema,
  ResponsesInputAssistantMessageItemSchema,
]);
export type ResponsesInputMessageItem = z.infer<typeof ResponsesInputMessageItemSchema>;

export const ResponsesFunctionCallOutputTextPartSchema = z.object({
  type: z.literal("output_text"),
  text: z.string(),
});
export const ResponsesFunctionCallOutputPartSchema = z.union([
  ResponsesFunctionCallOutputTextPartSchema,
  // FUTURE: richer tool output parts (image/file/video)
  ResponsesInputTextPartSchema,
  ResponsesInputImagePartSchema,
  ResponsesInputFilePartSchema,
]);
export type ResponsesFunctionCallOutputPart = z.infer<typeof ResponsesFunctionCallOutputPartSchema>;

export const ResponsesInputFunctionCallOutputItemSchema = z.object({
  type: z.literal("function_call_output"),
  id: z.string().optional(),
  status: ResponsesInputItemStatusSchema.optional(),
  call_id: z.string(),
  output: z.union([z.string(), z.array(ResponsesFunctionCallOutputPartSchema)]),
});
export type ResponsesInputFunctionCallOutputItem = z.infer<
  typeof ResponsesInputFunctionCallOutputItemSchema
>;

export const ResponsesInputFunctionCallItemSchema = z.object({
  type: z.literal("function_call"),
  id: z.string().optional(),
  call_id: z.string(),
  name: z.string(),
  arguments: z.string(),
  status: ResponsesInputItemStatusSchema.optional(),
});
export type ResponsesInputFunctionCallItem = z.infer<typeof ResponsesInputFunctionCallItemSchema>;

export const ResponsesInputReasoningSummaryItemSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
});
export const ResponsesInputReasoningItemSchema = z.object({
  type: z.literal("reasoning"),
  id: z.string().optional(),
  encrypted_content: z.string().optional(),
  summary: z.array(ResponsesInputReasoningSummaryItemSchema).optional(),
  // FUTURE: map reasoning item replay into model message parts
});
export type ResponsesInputReasoningItem = z.infer<typeof ResponsesInputReasoningItemSchema>;

export const ResponsesInputItemReferenceSchema = z.object({
  type: z.literal("item_reference"),
  id: z.string(),
  // FUTURE: previous response item lookups
});
export type ResponsesInputItemReference = z.infer<typeof ResponsesInputItemReferenceSchema>;

export const ResponsesInputItemSchema = z.union([
  ResponsesInputMessageItemSchema,
  ResponsesInputFunctionCallOutputItemSchema,
  ResponsesInputFunctionCallItemSchema,
  ResponsesInputReasoningItemSchema,
  ResponsesInputItemReferenceSchema,
]);
export type ResponsesInputItem = z.infer<typeof ResponsesInputItemSchema>;

const ResponsesFunctionToolSchema = z.object({
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    description: z.string().optional(),
    parameters: z.record(z.string(), z.unknown()),
    strict: z.boolean().optional(),
  }),
});

const ResponsesHostedToolSchema = z
  .object({
    type: z.string(),
  })
  .loose()
  .refine((tool) => tool.type !== "function", {
    message: "Non-function hosted tool",
  });

export const ResponsesToolSchema = z.union([
  ResponsesFunctionToolSchema,
  ResponsesHostedToolSchema, // FUTURE: built-in hosted tool details
]);
export type ResponsesTool = z.infer<typeof ResponsesToolSchema>;

const ResponsesNamedFunctionToolChoiceSchema = z.object({
  type: z.literal("function"),
  name: z.string(),
});

const ResponsesLegacyNamedFunctionToolChoiceSchema = z.object({
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
  }),
});

const ResponsesAllowedFunctionToolChoiceSchema = z.object({
  type: z.literal("allowed_tools"),
  allowed_tools: z.object({
    mode: z.enum(["auto", "required"]),
    tools: z.array(ResponsesLegacyNamedFunctionToolChoiceSchema).nonempty(),
  }),
});

export const ResponsesToolChoiceSchema = z.union([
  z.enum(["none", "auto", "required", "validated"]),
  ResponsesNamedFunctionToolChoiceSchema,
  ResponsesLegacyNamedFunctionToolChoiceSchema,
  ResponsesAllowedFunctionToolChoiceSchema,
  // FUTURE: custom tool choice objects
]);
export type ResponsesToolChoice = z.infer<typeof ResponsesToolChoiceSchema>;

export const ResponsesReasoningEffortSchema = z.enum([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);
export type ResponsesReasoningEffort = z.infer<typeof ResponsesReasoningEffortSchema>;

export const ResponsesReasoningSummarySchema = z.enum(["auto", "concise", "detailed"]);

export const ResponsesReasoningConfigSchema = z.object({
  enabled: z.optional(z.boolean()),
  effort: z.optional(ResponsesReasoningEffortSchema),
  max_tokens: z.optional(z.number()),
  exclude: z.optional(z.boolean()),
  summary: ResponsesReasoningSummarySchema.optional(),
});
export type ResponsesReasoningConfig = z.infer<typeof ResponsesReasoningConfigSchema>;

export const ResponsesResponseFormatSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text") }),
  z.object({
    type: z.literal("json_schema"),
    json_schema: z.object({
      name: z.string(),
      description: z.string().optional(),
      schema: z.record(z.string(), z.unknown()),
      strict: z.boolean().optional(),
    }),
  }),
]);
export type ResponsesResponseFormat = z.infer<typeof ResponsesResponseFormatSchema>;

export const ResponsesTextConfigSchema = z.object({
  format: ResponsesResponseFormatSchema.optional(),
});
export type ResponsesTextConfig = z.infer<typeof ResponsesTextConfigSchema>;

export const ResponsesIncludeSchema = z.enum([
  "reasoning.encrypted_content",
  "file_search_call.results",
  "message.input_image.image_url",
  "web_search_call.action.sources",
]);

const ResponsesInputsSchema = z.object({
  input: z.union([z.string(), z.array(ResponsesInputItemSchema)]),
  instructions: z.string().optional(),
  tools: z.array(ResponsesToolSchema).optional(),
  tool_choice: ResponsesToolChoiceSchema.optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_output_tokens: z.union([z.int().nonnegative(), z.literal("inf")]).optional(),
  frequency_penalty: z.number().min(-2.0).max(2.0).optional(),
  presence_penalty: z.number().min(-2.0).max(2.0).optional(),
  seed: z.int().optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  top_p: z.number().min(0).max(1.0).optional(),
  text: ResponsesTextConfigSchema.optional(),
  reasoning_effort: ResponsesReasoningEffortSchema.optional(),
  reasoning: ResponsesReasoningConfigSchema.optional().meta({ extension: true }),

  // Official params not fully implemented yet
  previous_response_id: z.string().optional(), // FUTURE: stateful chaining
  background: z.boolean().optional(), // FUTURE
  store: z.boolean().optional(), // FUTURE
  include: z.array(ResponsesIncludeSchema).optional(), // FUTURE
  truncation: z.enum(["disabled", "auto"]).optional(), // FUTURE
  metadata: z.record(z.string(), z.string()).optional(), // FUTURE
  parallel_tool_calls: z.boolean().optional(), // FUTURE
  max_tool_calls: z.int().positive().optional(), // FUTURE
  stream_options: z
    .object({
      include_usage: z.boolean().optional(),
    })
    .optional(), // FUTURE
  safety_identifier: z.string().optional(), // FUTURE
  service_tier: z.enum(["auto", "default", "flex", "priority"]).optional(), // FUTURE
  top_logprobs: z.int().min(0).max(20).optional(), // FUTURE
  user: z.string().optional(),

  // Extension parity with /chat/completions
  max_tokens: z.int().nonnegative().optional().meta({ extension: true }),
  max_completion_tokens: z.int().nonnegative().optional().meta({ extension: true }),
  prompt_cache_key: z.string().optional(),
  prompt_cache_retention: z.enum(["in_memory", "24h"]).optional(),
  cached_content: z.string().optional().meta({ extension: true }),
  cache_control: ResponsesCacheControlSchema.optional().meta({ extension: true }),
});
export type ResponsesInputs = z.infer<typeof ResponsesInputsSchema>;

export const ResponsesBodySchema = z.looseObject({
  model: z.string(),
  stream: z.boolean().optional(),
  ...ResponsesInputsSchema.shape,
});
export type ResponsesBody = z.infer<typeof ResponsesBodySchema>;

export const ResponsesOutputTextContentSchema = z.object({
  type: z.literal("output_text"),
  text: z.string(),
  annotations: z.array(z.unknown()).optional(),
});
export type ResponsesOutputTextContent = z.infer<typeof ResponsesOutputTextContentSchema>;

export const ResponsesOutputMessageSchema = z.object({
  id: z.string(),
  type: z.literal("message"),
  role: z.literal("assistant"),
  status: z.enum(["in_progress", "completed", "incomplete"]),
  content: z.array(ResponsesOutputTextContentSchema),
  tool_calls: z.array(ResponsesToolCallSchema).optional().meta({ extension: true }),
  reasoning_content: z.string().optional().meta({ extension: true }),
  reasoning_details: z.array(ResponsesReasoningDetailSchema).optional().meta({ extension: true }),
  provider_metadata: z.unknown().optional().meta({ extension: true }),
});
export type ResponsesOutputMessage = z.infer<typeof ResponsesOutputMessageSchema>;

export const ResponsesOutputFunctionCallSchema = z.object({
  id: z.string(),
  type: z.literal("function_call"),
  call_id: z.string(),
  name: z.string(),
  arguments: z.string(),
  status: z.enum(["in_progress", "completed", "incomplete"]),
});
export type ResponsesOutputFunctionCall = z.infer<typeof ResponsesOutputFunctionCallSchema>;

export const ResponsesOutputReasoningSchema = z.object({
  id: z.string(),
  type: z.literal("reasoning"),
  summary: z.array(z.unknown()).optional(),
  encrypted_content: z.string().optional(),
  status: z.enum(["in_progress", "completed", "incomplete"]).optional(),
});
export type ResponsesOutputReasoning = z.infer<typeof ResponsesOutputReasoningSchema>;

export const ResponsesOutputItemSchema = z.union([
  ResponsesOutputMessageSchema,
  ResponsesOutputFunctionCallSchema,
  ResponsesOutputReasoningSchema,
]);
export type ResponsesOutputItem = z.infer<typeof ResponsesOutputItemSchema>;

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
      cache_write_tokens: z.int().nonnegative().optional().meta({ extension: true }),
    })
    .optional(),
});
export type ResponsesUsage = z.infer<typeof ResponsesUsageSchema>;

export const ResponsesSchema = z.object({
  id: z.string(),
  object: z.literal("response"),
  created_at: z.int().nonnegative(),
  status: z.enum(["in_progress", "completed", "incomplete", "failed", "cancelled"]),
  model: z.string(),
  output: z.array(ResponsesOutputItemSchema),
  usage: ResponsesUsageSchema.nullable(),
  provider_metadata: z.unknown().optional().meta({ extension: true }),
  error: z.unknown().nullable().optional(),

  completed_at: z.int().nullable().optional(),
  incomplete_details: z.unknown().nullable().optional(),
  previous_response_id: z.string().nullable().optional(),
  instructions: z.string().nullable().optional(),
  tools: z.array(z.unknown()).optional(),
  tool_choice: z.unknown().optional(),
  parallel_tool_calls: z.boolean().optional(),
  max_output_tokens: z
    .union([z.int().nonnegative(), z.literal("inf")])
    .nullable()
    .optional(),
  max_tool_calls: z.int().positive().optional(),
  temperature: z.number().nullable().optional(),
  top_p: z.number().nullable().optional(),
  truncation: z.enum(["disabled", "auto"]).nullable().optional(),
  user: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  text: ResponsesTextConfigSchema.optional(),
  reasoning: ResponsesReasoningConfigSchema.optional(),
});
export type Responses = z.infer<typeof ResponsesSchema>;

const ResponsesStreamEventBaseSchema = z.object({
  sequence_number: z.int().nonnegative(),
});

export const ResponsesStreamEventSchema = z.discriminatedUnion("type", [
  ResponsesStreamEventBaseSchema.extend({
    type: z.literal("response.created"),
    response: ResponsesSchema,
  }),
  ResponsesStreamEventBaseSchema.extend({
    type: z.literal("response.in_progress"),
    response: ResponsesSchema,
  }),
  ResponsesStreamEventBaseSchema.extend({
    type: z.literal("response.output_item.added"),
    response_id: z.string(),
    output_index: z.int().nonnegative(),
    item: ResponsesOutputItemSchema,
  }),
  ResponsesStreamEventBaseSchema.extend({
    type: z.literal("response.content_part.added"),
    response_id: z.string(),
    output_index: z.int().nonnegative(),
    item_id: z.string(),
    content_index: z.int().nonnegative(),
    part: ResponsesOutputTextContentSchema,
  }),
  ResponsesStreamEventBaseSchema.extend({
    type: z.literal("response.output_text.delta"),
    response_id: z.string(),
    output_index: z.int().nonnegative(),
    item_id: z.string(),
    content_index: z.int().nonnegative(),
    delta: z.string(),
  }),
  ResponsesStreamEventBaseSchema.extend({
    type: z.literal("response.output_text.done"),
    response_id: z.string(),
    output_index: z.int().nonnegative(),
    item_id: z.string(),
    content_index: z.int().nonnegative(),
    text: z.string(),
  }),
  ResponsesStreamEventBaseSchema.extend({
    type: z.literal("response.content_part.done"),
    response_id: z.string(),
    output_index: z.int().nonnegative(),
    item_id: z.string(),
    content_index: z.int().nonnegative(),
    part: ResponsesOutputTextContentSchema,
  }),
  ResponsesStreamEventBaseSchema.extend({
    type: z.literal("response.function_call_arguments.delta"),
    response_id: z.string(),
    output_index: z.int().nonnegative(),
    item_id: z.string(),
    delta: z.string(),
  }),
  ResponsesStreamEventBaseSchema.extend({
    type: z.literal("response.function_call_arguments.done"),
    response_id: z.string(),
    output_index: z.int().nonnegative(),
    item_id: z.string(),
    arguments: z.string(),
  }),
  ResponsesStreamEventBaseSchema.extend({
    type: z.literal("response.output_item.done"),
    response_id: z.string(),
    output_index: z.int().nonnegative(),
    item: ResponsesOutputItemSchema,
  }),
  ResponsesStreamEventBaseSchema.extend({
    type: z.literal("response.completed"),
    response: ResponsesSchema,
  }),
  ResponsesStreamEventBaseSchema.extend({
    type: z.literal("response.failed"),
    response: ResponsesSchema,
  }),
  ResponsesStreamEventBaseSchema.extend({
    type: z.literal("response.incomplete"),
    response: ResponsesSchema,
  }),
]);
export type ResponsesStreamEvent = z.infer<typeof ResponsesStreamEventSchema>;
