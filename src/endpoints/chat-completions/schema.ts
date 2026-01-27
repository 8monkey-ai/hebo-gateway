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

export const OpenAICompatCompletionsParamsSchema = z.object({
  messages: z.array(OpenAICompatCompletionsMessageSchema),
  tools: z.optional(z.array(OpenAICompatCompletionsToolSchema)),
  tool_choice: z.optional(OpenAICompatCompletionsToolChoiceSchema),
  temperature: z.optional(z.number()),
});
export type OpenAICompatCompletionsParams = z.infer<typeof OpenAICompatCompletionsParamsSchema>;

export const OpenAICompatCompletionsRequestSchema = z.extend(OpenAICompatCompletionsParamsSchema, {
  model: z.string(),
  stream: z.optional(z.boolean()),
});
export type OpenAICompatCompletionsRequest = z.infer<typeof OpenAICompatCompletionsRequestSchema>;

export const OpenAICompatCompletionFinishReasonSchema = z.union([
  z.literal("stop"),
  z.literal("length"),
  z.literal("content_filter"),
  z.literal("tool_calls"),
]);
export type OpenAICompatCompletionFinishReason = z.infer<
  typeof OpenAICompatCompletionFinishReasonSchema
>;

export const OpenAICompatCompletionChoiceSchema = z.object({
  index: z.number(),
  message: OpenAICompatCompletionsAssistantMessageSchema,
  finish_reason: OpenAICompatCompletionFinishReasonSchema,
  logprobs: z.optional(z.any()),
});
export type OpenAICompatCompletionChoice = z.infer<typeof OpenAICompatCompletionChoiceSchema>;

export const OpenAICompatCompletionUsageSchema = z.object({
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
export type OpenAICompatCompletionUsage = z.infer<typeof OpenAICompatCompletionUsageSchema>;

export const OpenAICompatCompletionSchema = z.object({
  id: z.string(),
  object: z.literal("chat.completion"),
  created: z.number(),
  model: z.string(),
  choices: z.array(OpenAICompatCompletionChoiceSchema),
  usage: z.optional(OpenAICompatCompletionUsageSchema),
  system_fingerprint: z.optional(z.string()),
  providerMetadata: z.optional(z.any()),
});
export type OpenAICompatCompletion = z.infer<typeof OpenAICompatCompletionSchema>;

export type OpenAICompatCompletionToolCallDelta = {
  id: string;
  index: number;
  type: "function";
  function: { name: string; arguments: string };
};
