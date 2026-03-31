import type { SharedV3ProviderMetadata } from "@ai-sdk/provider";
import * as z from "zod";

/**
 * Shared Open Responses item schemas used by both /conversations and /responses.
 */

/**
 * --- Metadata ---
 */

// Note: The 16-key limit is not currently validated.
export const CacheControlSchema = z.object({
  type: z.literal("ephemeral"),
  ttl: z.string().optional(),
});
export type CacheControl = z.infer<typeof CacheControlSchema>;

export const ProviderMetadataSchema = z.record(
  z.string(),
  z.record(z.string(), z.any()),
) as z.ZodType<SharedV3ProviderMetadata>;
export type ProviderMetadata = SharedV3ProviderMetadata;

export const ReasoningEffortSchema = z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]);
export type ReasoningEffort = z.infer<typeof ReasoningEffortSchema>;

export const ReasoningConfigSchema = z.object({
  enabled: z.optional(z.boolean()),
  effort: z.optional(ReasoningEffortSchema),
  max_tokens: z.optional(z.number()),
  exclude: z.optional(z.boolean()),
});
export type ReasoningConfig = z.infer<typeof ReasoningConfigSchema>;

export const ServiceTierSchema = z.enum(["auto", "default", "flex", "scale", "priority"]);
export type ServiceTier = z.infer<typeof ServiceTierSchema>;

export const InputAudioFormatSchema = z.enum([
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
]);
export type InputAudioFormat = z.infer<typeof InputAudioFormatSchema>;

export const InputAudioSchema = z.object({
  data: z.string(),
  // only wav and mp3 are official by OpenAI, rest is taken from Gemini support:
  // https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/audio-understanding
  format: InputAudioFormatSchema,
});
export type InputAudio = z.infer<typeof InputAudioSchema>;

export const ContentPartAudioSchema = z.object({
  type: z.literal("input_audio"),
  input_audio: InputAudioSchema,
  // Extension origin: OpenRouter/Vercel/Anthropic
  cache_control: CacheControlSchema.optional().meta({ extension: true }),
});
export type ContentPartAudio = z.infer<typeof ContentPartAudioSchema>;
