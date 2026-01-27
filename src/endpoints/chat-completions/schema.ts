import * as z from "zod/mini";

export const OpenAICompatibleContentPartImageSchema = z.object({
  type: z.literal("image_url"),
  image_url: z.object({
    url: z.string(),
    detail: z.optional(z.union([z.literal("low"), z.literal("high"), z.literal("auto")])),
  }),
});

export const OpenAICompatibleContentPartTextSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

export const OpenAICompatibleContentPartFileSchema = z.object({
  type: z.literal("file"),
  file: z.object({
    data: z.string(),
    media_type: z.string(),
    filename: z.string(),
  }),
});

export const OpenAICompatibleMessageToolCallSchema = z.object({
  type: z.literal("function"),
  id: z.string(),
  function: z.object({
    arguments: z.string(),
    name: z.string(),
  }),
});

export const OpenAICompatibleSystemMessageSchema = z.object({
  role: z.literal("system"),
  content: z.string(),
});

export const OpenAICompatibleUserMessageSchema = z.object({
  role: z.literal("user"),
  content: z.union([
    z.string(),
    z.array(
      z.union([
        OpenAICompatibleContentPartTextSchema,
        OpenAICompatibleContentPartImageSchema,
        OpenAICompatibleContentPartFileSchema,
      ]),
    ),
  ]),
});

export const OpenAICompatibleAssistantMessageSchema = z.object({
  role: z.literal("assistant"),
  content: z.union([z.string(), z.null()]),
  tool_calls: z.optional(z.array(OpenAICompatibleMessageToolCallSchema)),
  reasoning: z.optional(z.string()),
  reasoning_content: z.optional(z.string()),
});

export const OpenAICompatibleToolMessageSchema = z.object({
  role: z.literal("tool"),
  content: z.string(),
  tool_call_id: z.string(),
});

export const OpenAICompatibleMessageSchema = z.union([
  OpenAICompatibleSystemMessageSchema,
  OpenAICompatibleUserMessageSchema,
  OpenAICompatibleAssistantMessageSchema,
  OpenAICompatibleToolMessageSchema,
]);

export const OpenAICompatibleToolSchema = z.object({
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    description: z.optional(z.string()),
    parameters: z.record(z.string(), z.any()),
  }),
});

export const OpenAICompatibleToolChoiceSchema = z.union([
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

export const OpenAICompatibleFinishReasonSchema = z.union([
  z.literal("stop"),
  z.literal("length"),
  z.literal("content_filter"),
  z.literal("tool_calls"),
]);

export const OpenAICompatibleChatCompletionsParamsSchema = z.object({
  messages: z.array(OpenAICompatibleMessageSchema),
  tools: z.optional(z.array(OpenAICompatibleToolSchema)),
  tool_choice: z.optional(OpenAICompatibleToolChoiceSchema),
  temperature: z.optional(z.number()),
});

export type OpenAICompatibleChatCompletionsParams = z.infer<
  typeof OpenAICompatibleChatCompletionsParamsSchema
>;

export const OpenAICompatibleChatCompletionsRequestBodySchema = z.extend(
  OpenAICompatibleChatCompletionsParamsSchema,
  {
    model: z.string(),
    stream: z.optional(z.boolean()),
  },
);

export type OpenAICompatibleChatCompletionsRequestBody = z.infer<
  typeof OpenAICompatibleChatCompletionsRequestBodySchema
>;

export const OpenAICompatibleChatCompletionChoiceSchema = z.object({
  index: z.number(),
  message: OpenAICompatibleAssistantMessageSchema,
  finish_reason: OpenAICompatibleFinishReasonSchema,
  logprobs: z.optional(z.any()),
});

export type OpenAICompatibleChatCompletionChoice = z.infer<
  typeof OpenAICompatibleChatCompletionChoiceSchema
>;

export const OpenAICompatibleChatCompletionsUsageSchema = z.object({
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

export type OpenAICompatibleChatCompletionsUsage = z.infer<
  typeof OpenAICompatibleChatCompletionsUsageSchema
>;

export const OpenAICompatibleChatCompletionsResponseBodySchema = z.object({
  id: z.string(),
  object: z.literal("chat.completion"),
  created: z.number(),
  model: z.string(),
  choices: z.array(OpenAICompatibleChatCompletionChoiceSchema),
  usage: z.optional(OpenAICompatibleChatCompletionsUsageSchema),
  system_fingerprint: z.optional(z.string()),
  providerMetadata: z.optional(z.any()),
});

export type OpenAICompatibleChatCompletionsResponseBody = z.infer<
  typeof OpenAICompatibleChatCompletionsResponseBodySchema
>;

export type OpenAICompatibleMessage = z.infer<typeof OpenAICompatibleMessageSchema>;
export type OpenAICompatibleSystemMessage = z.infer<typeof OpenAICompatibleSystemMessageSchema>;
export type OpenAICompatibleUserMessage = z.infer<typeof OpenAICompatibleUserMessageSchema>;
export type OpenAICompatibleMessageToolCall = z.infer<typeof OpenAICompatibleMessageToolCallSchema>;
export type OpenAICompatibleContentPart =
  | z.infer<typeof OpenAICompatibleContentPartTextSchema>
  | z.infer<typeof OpenAICompatibleContentPartImageSchema>
  | z.infer<typeof OpenAICompatibleContentPartFileSchema>;
export type OpenAICompatibleFinishReason = z.infer<typeof OpenAICompatibleFinishReasonSchema>;
export type OpenAICompatibleAssistantMessage = z.infer<
  typeof OpenAICompatibleAssistantMessageSchema
>;
export type OpenAICompatibleTool = z.infer<typeof OpenAICompatibleToolSchema>;
export type OpenAICompatibleToolChoice = z.infer<typeof OpenAICompatibleToolChoiceSchema>;
export type OpenAICompatibleToolMessage = z.infer<typeof OpenAICompatibleToolMessageSchema>;

export type OpenAICompatibleToolCallDelta = {
  id: string;
  index: number;
  type: "function";
  function: { name: string; arguments: string };
};
