import * as z from "zod/mini";

export const ChatCompletionsContentPartTextSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

export const ChatCompletionsContentPartImageSchema = z.object({
  type: z.literal("image_url"),
  image_url: z.object({
    url: z.string(),
    detail: z.optional(z.union([z.literal("low"), z.literal("high"), z.literal("auto")])),
  }),
});

export const ChatCompletionsContentPartFileSchema = z.object({
  type: z.literal("file"),
  file: z.object({
    data: z.string(),
    media_type: z.string(),
    filename: z.string(),
  }),
});

export type ChatCompletionsContentPart =
  | z.infer<typeof ChatCompletionsContentPartTextSchema>
  | z.infer<typeof ChatCompletionsContentPartImageSchema>
  | z.infer<typeof ChatCompletionsContentPartFileSchema>;

export const ChatCompletionsToolCallSchema = z.object({
  type: z.literal("function"),
  id: z.string(),
  function: z.object({
    arguments: z.string(),
    name: z.string(),
  }),
});
export type ChatCompletionsToolCall = z.infer<typeof ChatCompletionsToolCallSchema>;

export const ChatCompletionsSystemMessageSchema = z.object({
  role: z.literal("system"),
  content: z.string(),
});
export type ChatCompletionsSystemMessage = z.infer<typeof ChatCompletionsSystemMessageSchema>;

export const ChatCompletionsUserMessageSchema = z.object({
  role: z.literal("user"),
  content: z.union([
    z.string(),
    z.array(
      z.union([
        ChatCompletionsContentPartTextSchema,
        ChatCompletionsContentPartImageSchema,
        ChatCompletionsContentPartFileSchema,
      ]),
    ),
  ]),
});
export type ChatCompletionsUserMessage = z.infer<typeof ChatCompletionsUserMessageSchema>;

export const ChatCompletionsAssistantMessageSchema = z.object({
  role: z.literal("assistant"),
  content: z.union([z.string(), z.null()]),
  tool_calls: z.optional(z.array(ChatCompletionsToolCallSchema)),
  reasoning: z.optional(z.string()),
  reasoning_content: z.optional(z.string()),
});
export type ChatCompletionsAssistantMessage = z.infer<typeof ChatCompletionsAssistantMessageSchema>;

export const ChatCompletionsToolMessageSchema = z.object({
  role: z.literal("tool"),
  content: z.string(),
  tool_call_id: z.string(),
});
export type ChatCompletionsToolMessage = z.infer<typeof ChatCompletionsToolMessageSchema>;

export const ChatCompletionsMessageSchema = z.union([
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
    description: z.optional(z.string()),
    parameters: z.record(z.string(), z.any()),
  }),
});
export type ChatCompletionsTool = z.infer<typeof ChatCompletionsToolSchema>;

export const ChatCompletionsToolChoiceSchema = z.union([
  z.literal("none"),
  z.literal("auto"),
  z.literal("required"),
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

const ChatCompletionsCoreInputsSchema = z.object({
  messages: z.array(ChatCompletionsMessageSchema),
  tools: z.optional(z.array(ChatCompletionsToolSchema)),
  tool_choice: z.optional(ChatCompletionsToolChoiceSchema),
  temperature: z.optional(z.number()),
  max_tokens: z.optional(z.number()),
  max_completion_tokens: z.optional(z.number()),
});

const ChatCompletionsExtensionInputsSchema = z.object({
  reasoning: z.optional(ChatCompletionsReasoningConfigSchema),
  reasoning_effort: z.optional(ChatCompletionsReasoningEffortSchema),
});

export const ChatCompletionsInputsSchema = z.extend(
  ChatCompletionsCoreInputsSchema,
  ChatCompletionsExtensionInputsSchema.shape,
);
export type ChatCompletionsInputs = z.infer<typeof ChatCompletionsInputsSchema>;

export const ChatCompletionsBodySchema = z.extend(ChatCompletionsInputsSchema, {
  model: z.string(),
  stream: z.optional(z.boolean()),
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
  index: z.number(),
  message: ChatCompletionsAssistantMessageSchema,
  finish_reason: ChatCompletionsFinishReasonSchema,
  logprobs: z.optional(z.any()),
});
export type ChatCompletionsChoice = z.infer<typeof ChatCompletionsChoiceSchema>;

export const ChatCompletionsUsageSchema = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number(),
  completion_tokens_details: z.optional(
    z.object({
      reasoning_tokens: z.optional(z.number()),
    }),
  ),
  prompt_tokens_details: z.optional(
    z.object({
      cached_tokens: z.optional(z.number()),
    }),
  ),
});
export type ChatCompletionsUsage = z.infer<typeof ChatCompletionsUsageSchema>;

export const ChatCompletionsSchema = z.object({
  id: z.string(),
  object: z.literal("chat.completion"),
  created: z.number(),
  model: z.string(),
  choices: z.array(ChatCompletionsChoiceSchema),
  usage: z.optional(ChatCompletionsUsageSchema),
  system_fingerprint: z.optional(z.string()),
  providerMetadata: z.optional(z.any()),
});
export type ChatCompletions = z.infer<typeof ChatCompletionsSchema>;

export type ChatCompletionsToolCallDelta = {
  id: string;
  index: number;
  type: "function";
  function: { name: string; arguments: string };
};
