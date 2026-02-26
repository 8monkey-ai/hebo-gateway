import * as z from "zod";

export const ChatCompletionsCacheControlSchema = z.object({
  type: z.literal("ephemeral"),
  ttl: z.string().optional(),
});
export type ChatCompletionsCacheControl = z.infer<typeof ChatCompletionsCacheControlSchema>;

export const ChatCompletionsContentPartTextSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  // Extension origin: Anthropic/OpenRouter/Vercel
  cache_control: ChatCompletionsCacheControlSchema.optional().meta({ extension: true }),
});
export type ChatCompletionsContentPartText = z.infer<typeof ChatCompletionsContentPartTextSchema>;

export const ChatCompletionsContentPartImageSchema = z.object({
  type: z.literal("image_url"),
  image_url: z.object({
    url: z.string(),
    detail: z.enum(["low", "high", "auto"]).optional(),
  }),
  // Extension origin: OpenRouter/Vercel/Anthropic
  cache_control: ChatCompletionsCacheControlSchema.optional().meta({ extension: true }),
});

export const ChatCompletionsContentPartFileSchema = z.object({
  type: z.literal("file"),
  file: z.object({
    data: z.string(),
    media_type: z.string(),
    filename: z.string().optional(),
  }),
  // Extension origin: OpenRouter/Vercel/Anthropic
  cache_control: ChatCompletionsCacheControlSchema.optional().meta({ extension: true }),
});

export const ChatCompletionsContentPartAudioSchema = z.object({
  type: z.literal("input_audio"),
  input_audio: z.object({
    data: z.string(),
    // only wav and mp3 are official by OpenAI, rest is taken from Gemini support:
    // https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/audio-understanding
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
  // Extension origin: OpenRouter/Vercel/Anthropic
  cache_control: ChatCompletionsCacheControlSchema.optional().meta({ extension: true }),
});

export const ChatCompletionsContentPartSchema = z.discriminatedUnion("type", [
  ChatCompletionsContentPartTextSchema,
  ChatCompletionsContentPartImageSchema,
  ChatCompletionsContentPartFileSchema,
  ChatCompletionsContentPartAudioSchema,
]);
export type ChatCompletionsContentPart = z.infer<typeof ChatCompletionsContentPartSchema>;

export const ChatCompletionsToolCallSchema = z.object({
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
export type ChatCompletionsToolCall = z.infer<typeof ChatCompletionsToolCallSchema>;

export const ChatCompletionsSystemMessageSchema = z.object({
  role: z.literal("system"),
  content: z.string(),
  name: z.string().optional(),
  // Extension origin: OpenRouter/Vercel/Anthropic
  cache_control: ChatCompletionsCacheControlSchema.optional().meta({ extension: true }),
});
export type ChatCompletionsSystemMessage = z.infer<typeof ChatCompletionsSystemMessageSchema>;

export const ChatCompletionsUserMessageSchema = z.object({
  role: z.literal("user"),
  content: z.union([z.string(), z.array(ChatCompletionsContentPartSchema)]),
  name: z.string().optional(),
  // Extension origin: OpenRouter/Vercel/Anthropic
  cache_control: ChatCompletionsCacheControlSchema.optional().meta({ extension: true }),
});
export type ChatCompletionsUserMessage = z.infer<typeof ChatCompletionsUserMessageSchema>;

export const ChatCompletionsReasoningDetailSchema = z.object({
  id: z.string().optional(),
  index: z.int().nonnegative(),
  type: z.string(),
  text: z.string().optional(),
  signature: z.string().optional(),
  data: z.string().optional(),
  summary: z.string().optional(),
  format: z.string().optional(),
});
export type ChatCompletionsReasoningDetail = z.infer<typeof ChatCompletionsReasoningDetailSchema>;

export const ChatCompletionsAssistantMessageSchema = z.object({
  role: z.literal("assistant"),
  content: z
    .union([z.string(), z.null(), z.array(ChatCompletionsContentPartTextSchema)])
    .optional(),
  name: z.string().optional(),
  // FUTURE: This should also support Custom Tool Calls
  tool_calls: z.array(ChatCompletionsToolCallSchema).optional(),
  // Extension origin: OpenRouter/Vercel - TODO: should be "reasoning"?
  reasoning_content: z.string().optional().meta({ extension: true }),
  // Extension origin: OpenRouter/Vercel
  reasoning_details: z
    .array(ChatCompletionsReasoningDetailSchema)
    .optional()
    .meta({ extension: true }),
  // Extension origin: Gemini
  extra_content: z
    .record(z.string(), z.record(z.string(), z.unknown()))
    .optional()
    .meta({ extension: true }),
  // Extension origin: OpenRouter/Vercel/Anthropic
  cache_control: ChatCompletionsCacheControlSchema.optional().meta({ extension: true }),
});
export type ChatCompletionsAssistantMessage = z.infer<typeof ChatCompletionsAssistantMessageSchema>;

export const ChatCompletionsToolMessageSchema = z.object({
  role: z.literal("tool"),
  content: z.union([z.string(), z.array(ChatCompletionsContentPartTextSchema)]),
  tool_call_id: z.string(),
});
export type ChatCompletionsToolMessage = z.infer<typeof ChatCompletionsToolMessageSchema>;

export const ChatCompletionsMessageSchema = z.discriminatedUnion("role", [
  ChatCompletionsSystemMessageSchema,
  ChatCompletionsUserMessageSchema,
  ChatCompletionsAssistantMessageSchema,
  ChatCompletionsToolMessageSchema,
]);
export type ChatCompletionsMessage = z.infer<typeof ChatCompletionsMessageSchema>;

export const ChatCompletionsToolSchema = z.object({
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    description: z.string().optional(),
    parameters: z.record(z.string(), z.unknown()),
    strict: z.boolean().optional(),
  }),
});
export type ChatCompletionsTool = z.infer<typeof ChatCompletionsToolSchema>;

const ChatCompletionsNamedFunctionToolChoiceSchema = z.object({
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
  }),
});

const ChatCompletionsAllowedFunctionToolChoiceSchema = z.object({
  type: z.literal("allowed_tools"),
  allowed_tools: z.object({
    mode: z.enum(["auto", "required"]),
    tools: z.array(ChatCompletionsNamedFunctionToolChoiceSchema).nonempty(),
  }),
});

export const ChatCompletionsToolChoiceSchema = z.union([
  z.enum(["none", "auto", "required", "validated"]),
  z.discriminatedUnion("type", [
    ChatCompletionsNamedFunctionToolChoiceSchema,
    ChatCompletionsAllowedFunctionToolChoiceSchema,
  ]),
  // FUTURE: Missing CustomTool
]);
export type ChatCompletionsToolChoice = z.infer<typeof ChatCompletionsToolChoiceSchema>;

export const ChatCompletionsReasoningEffortSchema = z.enum([
  "none",
  // Extension origin: Gemini
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  // Extension origin: Anthropic
  "max",
]);
export type ChatCompletionsReasoningEffort = z.infer<typeof ChatCompletionsReasoningEffortSchema>;

export const ChatCompletionsReasoningConfigSchema = z.object({
  enabled: z.optional(z.boolean()),
  effort: z.optional(ChatCompletionsReasoningEffortSchema),
  max_tokens: z.optional(z.number()),
  exclude: z.optional(z.boolean()),
});
export type ChatCompletionsReasoningConfig = z.infer<typeof ChatCompletionsReasoningConfigSchema>;

export const ChatCompletionsResponseFormatJsonSchema = z.object({
  // FUTURE: consider support for legacy json_object (if demand)
  type: z.literal("json_schema"),
  json_schema: z.object({
    name: z.string(),
    description: z.string().optional(),
    schema: z.record(z.string(), z.unknown()),
    // FUTURE: consider support for non-strict mode (for providers that support it)
    strict: z.boolean().optional(),
  }),
});
export const ChatCompletionsResponseFormatTextSchema = z.object({
  type: z.literal("text"),
});
export const ChatCompletionsResponseFormatSchema = z.discriminatedUnion("type", [
  ChatCompletionsResponseFormatJsonSchema,
  ChatCompletionsResponseFormatTextSchema,
]);
export type ChatCompletionsResponseFormat = z.infer<typeof ChatCompletionsResponseFormatSchema>;

const ChatCompletionsInputsSchema = z.object({
  messages: z.array(ChatCompletionsMessageSchema),
  tools: z.array(ChatCompletionsToolSchema).optional(),
  tool_choice: ChatCompletionsToolChoiceSchema.optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.int().nonnegative().optional(),
  max_completion_tokens: z.int().nonnegative().optional(),
  frequency_penalty: z.number().min(-2.0).max(2.0).optional(),
  presence_penalty: z.number().min(-2.0).max(2.0).optional(),
  seed: z.int().optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  top_p: z.number().min(0).max(1.0).optional(),
  response_format: ChatCompletionsResponseFormatSchema.optional(),
  reasoning_effort: ChatCompletionsReasoningEffortSchema.optional(),
  prompt_cache_key: z.string().optional(),
  prompt_cache_retention: z.enum(["in_memory", "24h"]).optional(),
  // Extension origin: Gemini explicit cache handle
  cached_content: z.string().optional().meta({ extension: true }),
  // Extension origin: OpenRouter/Vercel/Anthropic
  cache_control: ChatCompletionsCacheControlSchema.optional().meta({ extension: true }),
  // Extension origin: OpenRouter
  reasoning: ChatCompletionsReasoningConfigSchema.optional().meta({ extension: true }),
});
export type ChatCompletionsInputs = z.infer<typeof ChatCompletionsInputsSchema>;

export const ChatCompletionsBodySchema = z.looseObject({
  model: z.string(),
  stream: z.boolean().optional(),
  ...ChatCompletionsInputsSchema.shape,
});
export type ChatCompletionsBody = z.infer<typeof ChatCompletionsBodySchema>;

export const ChatCompletionsFinishReasonSchema = z.enum([
  "stop",
  "length",
  "content_filter",
  "tool_calls",
]);
export type ChatCompletionsFinishReason = z.infer<typeof ChatCompletionsFinishReasonSchema>;

export const ChatCompletionsChoiceSchema = z.object({
  index: z.int().nonnegative(),
  message: ChatCompletionsAssistantMessageSchema,
  finish_reason: ChatCompletionsFinishReasonSchema,
  // FUTURE: model this out
  logprobs: z.unknown().optional(),
});
export type ChatCompletionsChoice = z.infer<typeof ChatCompletionsChoiceSchema>;

export const ChatCompletionsUsageSchema = z.object({
  prompt_tokens: z.int().nonnegative().optional(),
  completion_tokens: z.int().nonnegative().optional(),
  total_tokens: z.int().nonnegative().optional(),
  completion_tokens_details: z
    .object({
      // FUTURE: add missing properties
      reasoning_tokens: z.int().nonnegative().optional(),
    })
    .optional(),
  prompt_tokens_details: z
    .object({
      // FUTURE: add missing properties
      cached_tokens: z.int().nonnegative().optional(),
      // Extension origin: OpenRouter
      cache_write_tokens: z.int().nonnegative().optional().meta({ extension: true }),
    })
    .optional(),
});
export type ChatCompletionsUsage = z.infer<typeof ChatCompletionsUsageSchema>;

export const ChatCompletionsSchema = z.object({
  id: z.string(),
  object: z.literal("chat.completion"),
  created: z.int().nonnegative(),
  model: z.string(),
  choices: z.array(ChatCompletionsChoiceSchema),
  usage: ChatCompletionsUsageSchema.nullable(),
  // Extension origin: Vercel AI Gateway
  provider_metadata: z.unknown().optional().meta({ extension: true }),
});
export type ChatCompletions = z.infer<typeof ChatCompletionsSchema>;

export const ChatCompletionsToolCallDeltaSchema = ChatCompletionsToolCallSchema.partial().extend({
  index: z.int().nonnegative(),
});
export type ChatCompletionsToolCallDelta = z.infer<typeof ChatCompletionsToolCallDeltaSchema>;

export const ChatCompletionsAssistantMessageDeltaSchema =
  ChatCompletionsAssistantMessageSchema.partial().extend({
    tool_calls: z.array(ChatCompletionsToolCallDeltaSchema).optional(),
  });
export type ChatCompletionsAssistantMessageDelta = z.infer<
  typeof ChatCompletionsAssistantMessageDeltaSchema
>;

export const ChatCompletionsChoiceDeltaSchema = z.object({
  index: z.int().nonnegative(),
  delta: ChatCompletionsAssistantMessageDeltaSchema,
  finish_reason: ChatCompletionsFinishReasonSchema.nullable(),
  // FUTURE: model this out
  logprobs: z.unknown().optional(),
});
export type ChatCompletionsChoiceDelta = z.infer<typeof ChatCompletionsChoiceDeltaSchema>;

export const ChatCompletionsChunkSchema = z.object({
  id: z.string(),
  object: z.literal("chat.completion.chunk"),
  created: z.int().nonnegative(),
  model: z.string(),
  choices: z.array(ChatCompletionsChoiceDeltaSchema),
  usage: ChatCompletionsUsageSchema.nullable(),
  // Extension origin: Vercel AI Gateway
  provider_metadata: z.unknown().optional().meta({ extension: true }),
});
export type ChatCompletionsChunk = z.infer<typeof ChatCompletionsChunkSchema>;
