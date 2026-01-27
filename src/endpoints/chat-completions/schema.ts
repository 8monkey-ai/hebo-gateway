import * as z from "zod/mini";

export const OpenAICompatContentPartImageSchema = z.object({
  type: z.literal("image_url"),
  image_url: z.object({
    url: z.string(),
    detail: z.optional(z.union([z.literal("low"), z.literal("high"), z.literal("auto")])),
  }),
});

export const OpenAICompatContentPartTextSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

export const OpenAICompatContentPartFileSchema = z.object({
  type: z.literal("file"),
  file: z.object({
    data: z.string(),
    media_type: z.string(),
    filename: z.string(),
  }),
});

export const OpenAICompatMessageToolCallSchema = z.object({
  type: z.literal("function"),
  id: z.string(),
  function: z.object({
    arguments: z.string(),
    name: z.string(),
  }),
});

export const OpenAICompatSystemMessageSchema = z.object({
  role: z.literal("system"),
  content: z.string(),
});

export const OpenAICompatUserMessageSchema = z.object({
  role: z.literal("user"),
  content: z.union([
    z.string(),
    z.array(
      z.union([
        OpenAICompatContentPartTextSchema,
        OpenAICompatContentPartImageSchema,
        OpenAICompatContentPartFileSchema,
      ]),
    ),
  ]),
});

export const OpenAICompatAssistantMessageSchema = z.object({
  role: z.literal("assistant"),
  content: z.union([z.string(), z.null()]),
  tool_calls: z.optional(z.array(OpenAICompatMessageToolCallSchema)),
  reasoning: z.optional(z.string()),
  reasoning_content: z.optional(z.string()),
});

export const OpenAICompatToolMessageSchema = z.object({
  role: z.literal("tool"),
  content: z.string(),
  tool_call_id: z.string(),
});

export const OpenAICompatMessageSchema = z.union([
  OpenAICompatSystemMessageSchema,
  OpenAICompatUserMessageSchema,
  OpenAICompatAssistantMessageSchema,
  OpenAICompatToolMessageSchema,
]);

export const OpenAICompatToolSchema = z.object({
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    description: z.optional(z.string()),
    parameters: z.record(z.string(), z.any()),
  }),
});

export const OpenAICompatToolChoiceSchema = z.union([
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

export const OpenAICompatFinishReasonSchema = z.union([
  z.literal("stop"),
  z.literal("length"),
  z.literal("content_filter"),
  z.literal("tool_calls"),
]);

export const OpenAICompatChatCompletionsParamsSchema = z.object({
  messages: z.array(OpenAICompatMessageSchema),
  tools: z.optional(z.array(OpenAICompatToolSchema)),
  tool_choice: z.optional(OpenAICompatToolChoiceSchema),
  temperature: z.optional(z.number()),
});

export type OpenAICompatChatCompletionsParams = z.infer<
  typeof OpenAICompatChatCompletionsParamsSchema
>;

export const OpenAICompatChatCompletionsRequestSchema = z.extend(
  OpenAICompatChatCompletionsParamsSchema,
  {
    model: z.string(),
    stream: z.optional(z.boolean()),
  },
);

export type OpenAICompatChatCompletionsRequest = z.infer<
  typeof OpenAICompatChatCompletionsRequestSchema
>;

export const OpenAICompatChoiceSchema = z.object({
  index: z.number(),
  message: OpenAICompatAssistantMessageSchema,
  finish_reason: OpenAICompatFinishReasonSchema,
  logprobs: z.optional(z.any()),
});

export type OpenAICompatChoice = z.infer<typeof OpenAICompatChoiceSchema>;

export const OpenAICompatUsageSchema = z.object({
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

export type OpenAICompatUsage = z.infer<typeof OpenAICompatUsageSchema>;

export const OpenAICompatChatCompletionSchema = z.object({
  id: z.string(),
  object: z.literal("chat.completion"),
  created: z.number(),
  model: z.string(),
  choices: z.array(OpenAICompatChoiceSchema),
  usage: z.optional(OpenAICompatUsageSchema),
  system_fingerprint: z.optional(z.string()),
  providerMetadata: z.optional(z.any()),
});

export type OpenAICompatChatCompletion = z.infer<typeof OpenAICompatChatCompletionSchema>;

export type OpenAICompatMessage = z.infer<typeof OpenAICompatMessageSchema>;
export type OpenAICompatSystemMessage = z.infer<typeof OpenAICompatSystemMessageSchema>;
export type OpenAICompatUserMessage = z.infer<typeof OpenAICompatUserMessageSchema>;
export type OpenAICompatMessageToolCall = z.infer<typeof OpenAICompatMessageToolCallSchema>;
export type OpenAICompatContentPart =
  | z.infer<typeof OpenAICompatContentPartTextSchema>
  | z.infer<typeof OpenAICompatContentPartImageSchema>
  | z.infer<typeof OpenAICompatContentPartFileSchema>;
export type OpenAICompatFinishReason = z.infer<typeof OpenAICompatFinishReasonSchema>;
export type OpenAICompatAssistantMessage = z.infer<typeof OpenAICompatAssistantMessageSchema>;
export type OpenAICompatTool = z.infer<typeof OpenAICompatToolSchema>;
export type OpenAICompatToolChoice = z.infer<typeof OpenAICompatToolChoiceSchema>;
export type OpenAICompatToolMessage = z.infer<typeof OpenAICompatToolMessageSchema>;

export type OpenAICompatToolCallDelta = {
  id: string;
  index: number;
  type: "function";
  function: { name: string; arguments: string };
};
