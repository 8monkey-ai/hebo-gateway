import { z } from "zod";

export const OpenAICompatibleEmbeddingRequestBodySchema = z.object({
  input: z.union([z.string(), z.array(z.string())]),
  model: z.string(),
  encoding_format: z.enum(["float", "base64"]).optional(),
  dimensions: z.number().optional(),
  user: z.string().optional(),
});

export type OpenAICompatibleEmbeddingRequestBody = z.infer<
  typeof OpenAICompatibleEmbeddingRequestBodySchema
>;

export const OpenAICompatibleEmbeddingSchema = z.object({
  object: z.literal("embedding"),
  embedding: z.array(z.number()),
  index: z.number(),
});

export type OpenAICompatibleEmbedding = z.infer<typeof OpenAICompatibleEmbeddingSchema>;

export const OpenAICompatibleEmbeddingUsageSchema = z.object({
  prompt_tokens: z.number(),
  total_tokens: z.number(),
});

export type OpenAICompatibleEmbeddingUsage = z.infer<typeof OpenAICompatibleEmbeddingUsageSchema>;

export const OpenAICompatibleEmbeddingResponseBodySchema = z.object({
  object: z.literal("list"),
  data: z.array(OpenAICompatibleEmbeddingSchema),
  model: z.string(),
  usage: OpenAICompatibleEmbeddingUsageSchema,
  providerMetadata: z.any().optional(),
});

export type OpenAICompatibleEmbeddingResponseBody = z.infer<
  typeof OpenAICompatibleEmbeddingResponseBodySchema
>;
