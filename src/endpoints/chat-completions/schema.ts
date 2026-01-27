import * as z from "zod/mini";

export const CompletionsContentPartTextSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

export const CompletionsContentPartImageSchema = z.object({
  type: z.literal("image_url"),
  image_url: z.object({
    url: z.string(),
    detail: z.optional(z.union([z.literal("low"), z.literal("high"), z.literal("auto")])),
  }),
});

export const CompletionsContentPartFileSchema = z.object({
  type: z.literal("file"),
  file: z.object({
    data: z.string(),
    media_type: z.string(),
    filename: z.string(),
  }),
});

export type CompletionsContentPart =
  | z.infer<typeof CompletionsContentPartTextSchema>
  | z.infer<typeof CompletionsContentPartImageSchema>
  | z.infer<typeof CompletionsContentPartFileSchema>;

export const CompletionsMessageToolCallSchema = z.object({
  type: z.literal("function"),
  id: z.string(),
  function: z.object({
    arguments: z.string(),
    name: z.string(),
  }),
});
export type CompletionsMessageToolCall = z.infer<typeof CompletionsMessageToolCallSchema>;

export const CompletionsSystemMessageSchema = z.object({
  role: z.literal("system"),
  content: z.string(),
});
export type CompletionsSystemMessage = z.infer<typeof CompletionsSystemMessageSchema>;

export const CompletionsUserMessageSchema = z.object({
  role: z.literal("user"),
  content: z.union([
    z.string(),
    z.array(
      z.union([
        CompletionsContentPartTextSchema,
        CompletionsContentPartImageSchema,
        CompletionsContentPartFileSchema,
      ]),
    ),
  ]),
});
export type CompletionsUserMessage = z.infer<typeof CompletionsUserMessageSchema>;

export const CompletionsAssistantMessageSchema = z.object({
  role: z.literal("assistant"),
  content: z.union([z.string(), z.null()]),
  tool_calls: z.optional(z.array(CompletionsMessageToolCallSchema)),
  reasoning: z.optional(z.string()),
  reasoning_content: z.optional(z.string()),
});
export type CompletionsAssistantMessage = z.infer<typeof CompletionsAssistantMessageSchema>;

export const CompletionsToolMessageSchema = z.object({
  role: z.literal("tool"),
  content: z.string(),
  tool_call_id: z.string(),
});
export type CompletionsToolMessage = z.infer<typeof CompletionsToolMessageSchema>;

export const CompletionsMessageSchema = z.union([
  CompletionsSystemMessageSchema,
  CompletionsUserMessageSchema,
  CompletionsAssistantMessageSchema,
  CompletionsToolMessageSchema,
]);
export type CompletionsMessage = z.infer<typeof CompletionsMessageSchema>;

export const CompletionsToolSchema = z.object({
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    description: z.optional(z.string()),
    parameters: z.record(z.string(), z.any()),
  }),
});
export type CompletionsTool = z.infer<typeof CompletionsToolSchema>;

export const CompletionsToolChoiceSchema = z.union([
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
export type CompletionsToolChoice = z.infer<typeof CompletionsToolChoiceSchema>;

export const CompletionsInputsSchema = z.object({
  messages: z.array(CompletionsMessageSchema),
  tools: z.optional(z.array(CompletionsToolSchema)),
  tool_choice: z.optional(CompletionsToolChoiceSchema),
  temperature: z.optional(z.number()),
});
export type CompletionsInputs = z.infer<typeof CompletionsInputsSchema>;

export const CompletionsBodySchema = z.extend(CompletionsInputsSchema, {
  model: z.string(),
  stream: z.optional(z.boolean()),
});
export type CompletionsBody = z.infer<typeof CompletionsBodySchema>;

export const CompletionsFinishReasonSchema = z.union([
  z.literal("stop"),
  z.literal("length"),
  z.literal("content_filter"),
  z.literal("tool_calls"),
]);
export type CompletionsFinishReason = z.infer<typeof CompletionsFinishReasonSchema>;

export const CompletionsChoiceSchema = z.object({
  index: z.number(),
  message: CompletionsAssistantMessageSchema,
  finish_reason: CompletionsFinishReasonSchema,
  logprobs: z.optional(z.any()),
});
export type CompletionsChoice = z.infer<typeof CompletionsChoiceSchema>;

export const CompletionsUsageSchema = z.object({
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
export type CompletionsUsage = z.infer<typeof CompletionsUsageSchema>;

export const CompletionsSchema = z.object({
  id: z.string(),
  object: z.literal("chat.completion"),
  created: z.number(),
  model: z.string(),
  choices: z.array(CompletionsChoiceSchema),
  usage: z.optional(CompletionsUsageSchema),
  system_fingerprint: z.optional(z.string()),
  providerMetadata: z.optional(z.any()),
});
export type Completions = z.infer<typeof CompletionsSchema>;

export type CompletionsToolCallDelta = {
  id: string;
  index: number;
  type: "function";
  function: { name: string; arguments: string };
};
