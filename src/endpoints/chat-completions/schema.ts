import * as z from "zod/mini";

export const OpenAICompatCompletionsContentPartTextSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

export const OpenAICompatCompletionsContentPartImageSchema = z.object({
  type: z.literal("image_url"),
  image_url: z.object({
    url: z.string(),
    detail: z.optional(z.union([z.literal("low"), z.literal("high"), z.literal("auto")])),
  }),
});

export const OpenAICompatCompletionsContentPartFileSchema = z.object({
  type: z.literal("file"),
  file: z.object({
    data: z.string(),
    media_type: z.string(),
    filename: z.string(),
  }),
});

export type OpenAICompatCompletionsContentPart =
  | z.infer<typeof OpenAICompatCompletionsContentPartTextSchema>
  | z.infer<typeof OpenAICompatCompletionsContentPartImageSchema>
  | z.infer<typeof OpenAICompatCompletionsContentPartFileSchema>;

export const OpenAICompatCompletionsMessageToolCallSchema = z.object({
  type: z.literal("function"),
  id: z.string(),
  function: z.object({
    arguments: z.string(),
    name: z.string(),
  }),
});
export type OpenAICompatCompletionsMessageToolCall = z.infer<
  typeof OpenAICompatCompletionsMessageToolCallSchema
>;

export const OpenAICompatCompletionsSystemMessageSchema = z.object({
  role: z.literal("system"),
  content: z.string(),
});
export type OpenAICompatCompletionsSystemMessage = z.infer<
  typeof OpenAICompatCompletionsSystemMessageSchema
>;

export const OpenAICompatCompletionsUserMessageSchema = z.object({
  role: z.literal("user"),
  content: z.union([
    z.string(),
    z.array(
      z.union([
        OpenAICompatCompletionsContentPartTextSchema,
        OpenAICompatCompletionsContentPartImageSchema,
        OpenAICompatCompletionsContentPartFileSchema,
      ]),
    ),
  ]),
});
export type OpenAICompatCompletionsUserMessage = z.infer<
  typeof OpenAICompatCompletionsUserMessageSchema
>;

export const OpenAICompatCompletionsAssistantMessageSchema = z.object({
  role: z.literal("assistant"),
  content: z.union([z.string(), z.null()]),
  tool_calls: z.optional(z.array(OpenAICompatCompletionsMessageToolCallSchema)),
  reasoning: z.optional(z.string()),
  reasoning_content: z.optional(z.string()),
});
export type OpenAICompatCompletionsAssistantMessage = z.infer<
  typeof OpenAICompatCompletionsAssistantMessageSchema
>;

export const OpenAICompatCompletionsToolMessageSchema = z.object({
  role: z.literal("tool"),
  content: z.string(),
  tool_call_id: z.string(),
});
export type OpenAICompatCompletionsToolMessage = z.infer<
  typeof OpenAICompatCompletionsToolMessageSchema
>;

export const OpenAICompatCompletionsMessageSchema = z.union([
  OpenAICompatCompletionsSystemMessageSchema,
  OpenAICompatCompletionsUserMessageSchema,
  OpenAICompatCompletionsAssistantMessageSchema,
  OpenAICompatCompletionsToolMessageSchema,
]);
export type OpenAICompatCompletionsMessage = z.infer<typeof OpenAICompatCompletionsMessageSchema>;

export const OpenAICompatCompletionsToolSchema = z.object({
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    description: z.optional(z.string()),
    parameters: z.record(z.string(), z.any()),
  }),
});
export type OpenAICompatCompletionsTool = z.infer<typeof OpenAICompatCompletionsToolSchema>;

export const OpenAICompatCompletionsToolChoiceSchema = z.union([
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
export type OpenAICompatCompletionsToolChoice = z.infer<
  typeof OpenAICompatCompletionsToolChoiceSchema
>;

export const OpenAICompatCompletionsOptionsSchema = z.object({
  messages: z.array(OpenAICompatCompletionsMessageSchema),
  tools: z.optional(z.array(OpenAICompatCompletionsToolSchema)),
  tool_choice: z.optional(OpenAICompatCompletionsToolChoiceSchema),
  temperature: z.optional(z.number()),
});
export type OpenAICompatCompletionsOptions = z.infer<typeof OpenAICompatCompletionsOptionsSchema>;

export const OpenAICompatCompletionsRequestSchema = z.extend(OpenAICompatCompletionsOptionsSchema, {
  model: z.string(),
  stream: z.optional(z.boolean()),
});
export type OpenAICompatCompletionsRequest = z.infer<typeof OpenAICompatCompletionsRequestSchema>;

export const OpenAICompatCompletionsFinishReasonSchema = z.union([
  z.literal("stop"),
  z.literal("length"),
  z.literal("content_filter"),
  z.literal("tool_calls"),
]);
export type OpenAICompatCompletionsFinishReason = z.infer<
  typeof OpenAICompatCompletionsFinishReasonSchema
>;

export const OpenAICompatCompletionsChoiceSchema = z.object({
  index: z.number(),
  message: OpenAICompatCompletionsAssistantMessageSchema,
  finish_reason: OpenAICompatCompletionsFinishReasonSchema,
  logprobs: z.optional(z.any()),
});
export type OpenAICompatCompletionsChoice = z.infer<typeof OpenAICompatCompletionsChoiceSchema>;

export const OpenAICompatCompletionsUsageSchema = z.object({
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
export type OpenAICompatCompletionsUsage = z.infer<typeof OpenAICompatCompletionsUsageSchema>;

export const OpenAICompatCompletionsSchema = z.object({
  id: z.string(),
  object: z.literal("chat.completion"),
  created: z.number(),
  model: z.string(),
  choices: z.array(OpenAICompatCompletionsChoiceSchema),
  usage: z.optional(OpenAICompatCompletionsUsageSchema),
  system_fingerprint: z.optional(z.string()),
  providerMetadata: z.optional(z.any()),
});
export type OpenAICompatCompletions = z.infer<typeof OpenAICompatCompletionsSchema>;

export type OpenAICompatCompletionsToolCallDelta = {
  id: string;
  index: number;
  type: "function";
  function: { name: string; arguments: string };
};
