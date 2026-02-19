import * as z from "zod";

export const ChatCompletionsContentPartTextSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

export const ChatCompletionsContentPartImageSchema = z.object({
  type: z.literal("image_url"),
  image_url: z.object({
    url: z.string(),
    detail: z.union([z.literal("low"), z.literal("high"), z.literal("auto")]).optional(),
  }),
});

export const ChatCompletionsContentPartFileSchema = z.object({
  type: z.literal("file"),
  file: z.object({
    data: z.string(),
    media_type: z.string(),
    filename: z.string().optional(),
  }),
});

export const ChatCompletionsContentPartAudioSchema = z.object({
  type: z.literal("input_audio"),
  input_audio: z.object({
    data: z.string(),
    // only wav and mp3 are official, the rest is what Gemini supports
    format: z.enum(["wav", "mp3", "aiff", "aac", "ogg", "flac"]),
  }),
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
  extra_content: z.record(z.string(), z.any()).optional().meta({ extension: true }),
});
export type ChatCompletionsToolCall = z.infer<typeof ChatCompletionsToolCallSchema>;

export const ChatCompletionsSystemMessageSchema = z.object({
  role: z.literal("system"),
  content: z.string(),
  name: z.string().optional(),
});
export type ChatCompletionsSystemMessage = z.infer<typeof ChatCompletionsSystemMessageSchema>;

export const ChatCompletionsUserMessageSchema = z.object({
  role: z.literal("user"),
  content: z.union([z.string(), z.array(ChatCompletionsContentPartSchema)]),
  name: z.string().optional(),
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
  // FUTURE: this should support arrays of TextContentPart and RefusalContentPart
  content: z.union([z.string(), z.null()]).optional(),
  name: z.string().optional(),
  // FUTURE: This should also support Custom Tool Calls
  tool_calls: z.array(ChatCompletionsToolCallSchema).optional(),
  // Extensions
  reasoning_content: z.string().optional().meta({ extension: true }),
  reasoning_details: z
    .array(ChatCompletionsReasoningDetailSchema)
    .optional()
    .meta({ extension: true }),
  extra_content: z.record(z.string(), z.any()).optional().meta({ extension: true }),
});
export type ChatCompletionsAssistantMessage = z.infer<typeof ChatCompletionsAssistantMessageSchema>;

export const ChatCompletionsToolMessageSchema = z.object({
  role: z.literal("tool"),
  // FUTURE: this should also support arrays of TextContentParts
  content: z.string(),
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
    parameters: z.record(z.string(), z.any()),
    // Missing strict parameter
  }),
});
export type ChatCompletionsTool = z.infer<typeof ChatCompletionsToolSchema>;

export const ChatCompletionsToolChoiceSchema = z.union([
  z.literal("none"),
  z.literal("auto"),
  z.literal("required"),
  // FUTURE: missing AllowedTools and CustomToolChoice
  z.object({
    type: z.literal("function"),
    function: z.object({
      name: z.string(),
    }),
  }),
]);
export type ChatCompletionsToolChoice = z.infer<typeof ChatCompletionsToolChoiceSchema>;

export const ChatCompletionsReasoningEffortSchema = z.union([
  z.literal("none"),
  z.literal("minimal"),
  z.literal("low"),
  z.literal("medium"),
  z.literal("high"),
  z.literal("xhigh"),
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
    schema: z.record(z.string(), z.any()),
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
  tools: z
    .array(
      // FUTURE: Missing CustomTool
      ChatCompletionsToolSchema,
    )
    .optional(),
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
  // Extensions
  reasoning: ChatCompletionsReasoningConfigSchema.optional().meta({ extension: true }),
});
export type ChatCompletionsInputs = z.infer<typeof ChatCompletionsInputsSchema>;

export const ChatCompletionsBodySchema = z.looseObject({
  model: z.string(),
  stream: z.boolean().optional(),
  ...ChatCompletionsInputsSchema.shape,
});
export type ChatCompletionsBody = z.infer<typeof ChatCompletionsBodySchema>;

export const ChatCompletionsFinishReasonSchema = z.union([
  z.literal("stop"),
  z.literal("length"),
  z.literal("content_filter"),
  z.literal("tool_calls"),
]);
export type ChatCompletionsFinishReason = z.infer<typeof ChatCompletionsFinishReasonSchema>;

export const ChatCompletionsChoiceSchema = z.object({
  index: z.int().nonnegative(),
  message: ChatCompletionsAssistantMessageSchema,
  finish_reason: ChatCompletionsFinishReasonSchema,
  // FUTURE: model this out
  logprobs: z.any().optional(),
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
  // Extensions
  provider_metadata: z.any().optional().meta({ extension: true }),
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
  logprobs: z.any().optional(),
});
export type ChatCompletionsChoiceDelta = z.infer<typeof ChatCompletionsChoiceDeltaSchema>;

export const ChatCompletionsChunkSchema = z.object({
  id: z.string(),
  object: z.literal("chat.completion.chunk"),
  created: z.int().nonnegative(),
  model: z.string(),
  choices: z.array(ChatCompletionsChoiceDeltaSchema),
  usage: ChatCompletionsUsageSchema.nullable(),
  // Extensions
  provider_metadata: z.any().optional().meta({ extension: true }),
});
export type ChatCompletionsChunk = z.infer<typeof ChatCompletionsChunkSchema>;
