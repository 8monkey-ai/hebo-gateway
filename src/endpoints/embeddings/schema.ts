import * as z from "zod/mini";

export const OpenAICompatEmbeddingsOptionsSchema = z.object({
  input: z.union([z.string(), z.array(z.string())]),
  encoding_format: z.optional(z.enum(["float", "base64"])),
  dimensions: z.optional(z.number()),
  user: z.optional(z.string()),
});
export type OpenAICompatEmbeddingsOptions = z.infer<typeof OpenAICompatEmbeddingsOptionsSchema>;

export const OpenAICompatEmbeddingsRequestSchema = z.extend(OpenAICompatEmbeddingsOptionsSchema, {
  model: z.string(),
});
export type OpenAICompatEmbeddingsRequest = z.infer<typeof OpenAICompatEmbeddingsRequestSchema>;

export const OpenAICompatEmbeddingsDataSchema = z.object({
  object: z.literal("embedding"),
  embedding: z.array(z.number()),
  index: z.number(),
});
export type OpenAICompatEmbeddingsData = z.infer<typeof OpenAICompatEmbeddingsDataSchema>;

export const OpenAICompatEmbeddingUsageSchema = z.object({
  prompt_tokens: z.number(),
  total_tokens: z.number(),
});
export type OpenAICompatEmbeddingsUsage = z.infer<typeof OpenAICompatEmbeddingUsageSchema>;

export const OpenAICompatEmbeddingsSchema = z.object({
  object: z.literal("list"),
  data: z.array(OpenAICompatEmbeddingsDataSchema),
  model: z.string(),
  usage: OpenAICompatEmbeddingUsageSchema,
  providerMetadata: z.optional(z.any()),
});
export type OpenAICompatEmbeddings = z.infer<typeof OpenAICompatEmbeddingsSchema>;
