import * as z from "zod";

import type { SseFrame } from "../../utils/stream";
import { CacheControlSchema } from "../shared/schema";

// --- Content Block Schemas ---

const TextBlockSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  cache_control: CacheControlSchema.optional(),
});

const ImageSourceBase64Schema = z.object({
  type: z.literal("base64"),
  media_type: z.string(),
  data: z.string(),
});

const ImageSourceUrlSchema = z.object({
  type: z.literal("url"),
  url: z.string(),
});

const ImageBlockSchema = z.object({
  type: z.literal("image"),
  source: z.discriminatedUnion("type", [ImageSourceBase64Schema, ImageSourceUrlSchema]),
  cache_control: CacheControlSchema.optional(),
});

const DocumentSourceBase64Schema = z.object({
  type: z.literal("base64"),
  media_type: z.string(),
  data: z.string(),
});

const DocumentSourceUrlSchema = z.object({
  type: z.literal("url"),
  url: z.string(),
});

const DocumentSourceTextSchema = z.object({
  type: z.literal("text"),
  data: z.string(),
  media_type: z.literal("text/plain"),
});

const DocumentBlockSchema = z.object({
  type: z.literal("document"),
  source: z.discriminatedUnion("type", [
    DocumentSourceBase64Schema,
    DocumentSourceUrlSchema,
    DocumentSourceTextSchema,
  ]),
  cache_control: CacheControlSchema.optional(),
});

const ToolUseBlockSchema = z.object({
  type: z.literal("tool_use"),
  id: z.string(),
  name: z.string(),
  input: z.any(),
});

const ToolResultContentBlockSchema = z.union([
  z.string(),
  z.array(z.union([TextBlockSchema, ImageBlockSchema])),
]);

const ToolResultBlockSchema = z.object({
  type: z.literal("tool_result"),
  tool_use_id: z.string(),
  content: ToolResultContentBlockSchema.optional(),
  is_error: z.boolean().optional(),
  cache_control: CacheControlSchema.optional(),
});

const ThinkingBlockSchema = z.object({
  type: z.literal("thinking"),
  thinking: z.string(),
  signature: z.string(),
});

const RedactedThinkingBlockSchema = z.object({
  type: z.literal("redacted_thinking"),
  data: z.string(),
});

// --- Message Schemas ---

const UserContentBlockSchema = z.discriminatedUnion("type", [
  TextBlockSchema,
  ImageBlockSchema,
  ToolResultBlockSchema,
  DocumentBlockSchema,
]);
export type UserContentBlock = z.infer<typeof UserContentBlockSchema>;

const AssistantContentBlockSchema = z.discriminatedUnion("type", [
  TextBlockSchema,
  ToolUseBlockSchema,
  ThinkingBlockSchema,
  RedactedThinkingBlockSchema,
]);
export type AssistantContentBlock = z.infer<typeof AssistantContentBlockSchema>;

const UserMessageSchema = z.object({
  role: z.literal("user"),
  content: z.union([z.string(), z.array(UserContentBlockSchema)]),
});

const AssistantMessageSchema = z.object({
  role: z.literal("assistant"),
  content: z.union([z.string(), z.array(AssistantContentBlockSchema)]),
});

const MessagesMessageSchema = z.discriminatedUnion("role", [
  UserMessageSchema,
  AssistantMessageSchema,
]);
export type MessagesMessage = z.infer<typeof MessagesMessageSchema>;

// --- System Block Schema ---

// FUTURE: Support multimodal content in system messages (currently limited to text by AI SDK)
const SystemBlockSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  cache_control: CacheControlSchema.optional(),
});

// --- Tool Schemas ---

const MessagesToolSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  input_schema: z.any(),
  // FUTURE: cache_control support on tools
  strict: z.boolean().optional(),
});
export type MessagesTool = z.infer<typeof MessagesToolSchema>;

const MessagesToolChoiceAutoSchema = z.object({ type: z.literal("auto") });
const MessagesToolChoiceAnySchema = z.object({ type: z.literal("any") });
const MessagesToolChoiceNoneSchema = z.object({ type: z.literal("none") });
const MessagesToolChoiceToolSchema = z.object({
  type: z.literal("tool"),
  name: z.string(),
});
const MessagesToolChoiceSchema = z.discriminatedUnion("type", [
  MessagesToolChoiceAutoSchema,
  MessagesToolChoiceAnySchema,
  MessagesToolChoiceNoneSchema,
  MessagesToolChoiceToolSchema,
]);
export type MessagesToolChoice = z.infer<typeof MessagesToolChoiceSchema>;

// --- Thinking Config Schema ---

const ThinkingEnabledSchema = z.object({
  type: z.literal("enabled"),
  budget_tokens: z.number().int().min(1024),
  display: z.enum(["summarized", "omitted"]).optional(),
});

const ThinkingDisabledSchema = z.object({
  type: z.literal("disabled"),
});

const ThinkingAdaptiveSchema = z.object({
  type: z.literal("adaptive"),
  display: z.enum(["summarized", "omitted"]).optional(),
});

const MessagesThinkingConfigSchema = z.discriminatedUnion("type", [
  ThinkingEnabledSchema,
  ThinkingDisabledSchema,
  ThinkingAdaptiveSchema,
]);
export type MessagesThinkingConfig = z.infer<typeof MessagesThinkingConfigSchema>;

// --- Service Tier Schema (Anthropic-native values) ---

const MessagesServiceTierSchema = z.enum(["auto", "standard_only"]);
export type MessagesServiceTier = z.infer<typeof MessagesServiceTierSchema>;

// --- Output Config Schema ---

const MessagesOutputFormatSchema = z.object({
  type: z.literal("json_schema"),
  schema: z.any(),
});

const MessagesOutputConfigSchema = z.object({
  format: MessagesOutputFormatSchema.optional(),
  effort: z.enum(["low", "medium", "high", "max"]).optional(),
});
export type MessagesOutputConfig = z.infer<typeof MessagesOutputConfigSchema>;

// --- Request Body Schema ---

export const MessagesBodySchema = z.object({
  model: z.string(),
  max_tokens: z.number().int().min(1),
  messages: z.array(MessagesMessageSchema),
  system: z.union([z.string(), z.array(SystemBlockSchema)]).optional(),
  stream: z.boolean().optional(),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  stop_sequences: z.array(z.string()).optional(),
  tools: z.array(MessagesToolSchema).optional(),
  tool_choice: MessagesToolChoiceSchema.optional(),
  thinking: MessagesThinkingConfigSchema.optional(),
  metadata: z.object({ user_id: z.string().optional() }).optional(),
  service_tier: MessagesServiceTierSchema.optional(),
  cache_control: CacheControlSchema.optional(),
  output_config: MessagesOutputConfigSchema.optional(),
});
export type MessagesBody = z.infer<typeof MessagesBodySchema>;
export type MessagesInputs = Omit<MessagesBody, "model" | "stream">;

// --- Response Schemas ---

export type MessagesResponseContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "thinking"; thinking: string; signature: string }
  | { type: "redacted_thinking"; data: string };

export type MessagesUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

export type MessagesStopReason = "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | null;

export type Messages = {
  id: string;
  type: "message";
  role: "assistant";
  content: MessagesResponseContentBlock[];
  model: string;
  stop_reason: MessagesStopReason;
  stop_sequence: string | null;
  usage: MessagesUsage;
  service_tier?: MessagesServiceTier;
};

// --- Stream Event Types ---

export type MessageStartEvent = SseFrame<
  { type: "message_start"; message: Messages },
  "message_start"
>;

export type ContentBlockStartEvent = SseFrame<
  {
    type: "content_block_start";
    index: number;
    content_block:
      | { type: "text"; text: string }
      | { type: "thinking"; thinking: string }
      | { type: "tool_use"; id: string; name: string; input: Record<string, never> };
  },
  "content_block_start"
>;

export type ContentBlockDeltaEvent = SseFrame<
  {
    type: "content_block_delta";
    index: number;
    delta:
      | { type: "text_delta"; text: string }
      | { type: "thinking_delta"; thinking: string }
      | { type: "signature_delta"; signature: string }
      | { type: "input_json_delta"; partial_json: string };
  },
  "content_block_delta"
>;

export type ContentBlockStopEvent = SseFrame<
  { type: "content_block_stop"; index: number },
  "content_block_stop"
>;

export type MessageDeltaEvent = SseFrame<
  {
    type: "message_delta";
    delta: { stop_reason: MessagesStopReason; stop_sequence: string | null };
    usage: { output_tokens: number; input_tokens?: number };
  },
  "message_delta"
>;

export type MessageStopEvent = SseFrame<{ type: "message_stop" }, "message_stop">;

export type MessageErrorEvent = SseFrame<
  { type: "error"; error: { type: string; message: string } },
  "error"
>;

export type MessagesStreamEvent =
  | MessageStartEvent
  | ContentBlockStartEvent
  | ContentBlockDeltaEvent
  | ContentBlockStopEvent
  | MessageDeltaEvent
  | MessageStopEvent
  | MessageErrorEvent;

export type MessagesStream = ReadableStream<MessagesStreamEvent>;
