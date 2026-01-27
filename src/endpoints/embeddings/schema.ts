import * as z from "zod/mini";

export const OpenAICompatEmbeddingsParamsSchema = z.object({
  input: z.union([z.string(), z.array(z.string())]),
  encoding_format: z.optional(z.enum(["float", "base64"])),
  dimensions: z.optional(z.number()),
  user: z.optional(z.string()),
});
export type OpenAICompatEmbeddingsParams = z.infer<typeof OpenAICompatEmbeddingsParamsSchema>;

export const OpenAICompatEmbeddingsRequestSchema = z.extend(OpenAICompatEmbeddingsParamsSchema, {
  model: z.string(),
});
export type OpenAICompatEmbeddingsRequest = z.infer<typeof OpenAICompatEmbeddingsRequestSchema>;

export const OpenAICompatEmbeddingDataSchema = z.object({
  object: z.literal("embedding"),
  embedding: z.array(z.number()),
  index: z.number(),
});
export type OpenAICompatEmbeddingData = z.infer<typeof OpenAICompatEmbeddingDataSchema>;

export const OpenAICompatEmbeddingUsageSchema = z.object({
  prompt_tokens: z.number(),
  total_tokens: z.number(),
});
export type OpenAICompatEmbeddingUsage = z.infer<typeof OpenAICompatEmbeddingUsageSchema>;

export const OpenAICompatEmbeddingSchema = z.object({
  object: z.literal("list"),
  data: z.array(OpenAICompatEmbeddingDataSchema),
  model: z.string(),
  usage: OpenAICompatEmbeddingUsageSchema,
  providerMetadata: z.optional(z.any()),
});
export type OpenAICompatEmbedding = z.infer<typeof OpenAICompatEmbeddingSchema>;
