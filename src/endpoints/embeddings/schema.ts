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

export const OpenAICompatEmbeddingSchema = z.object({
  object: z.literal("embedding"),
  embedding: z.array(z.number()),
  index: z.number(),
});

export type OpenAICompatEmbedding = z.infer<typeof OpenAICompatEmbeddingSchema>;

export const OpenAICompatEmbeddingsUsageSchema = z.object({
  prompt_tokens: z.number(),
  total_tokens: z.number(),
});

export type OpenAICompatEmbeddingsUsage = z.infer<typeof OpenAICompatEmbeddingsUsageSchema>;

export const OpenAICompatEmbeddingResponseSchema = z.object({
  object: z.literal("list"),
  data: z.array(OpenAICompatEmbeddingSchema),
  model: z.string(),
  usage: OpenAICompatEmbeddingsUsageSchema,
  providerMetadata: z.optional(z.any()),
});

export type OpenAICompatEmbeddingResponse = z.infer<typeof OpenAICompatEmbeddingResponseSchema>;
