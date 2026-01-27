import * as z from "zod/mini";

export const OpenAICompatEmbeddingParamsSchema = z.object({
  input: z.union([z.string(), z.array(z.string())]),
  encoding_format: z.optional(z.enum(["float", "base64"])),
  dimensions: z.optional(z.number()),
  user: z.optional(z.string()),
});

export type OpenAICompatEmbeddingParams = z.infer<typeof OpenAICompatEmbeddingParamsSchema>;

export const OpenAICompatEmbeddingRequestBodySchema = z.extend(OpenAICompatEmbeddingParamsSchema, {
  model: z.string(),
});

export type OpenAICompatEmbeddingRequestBody = z.infer<
  typeof OpenAICompatEmbeddingRequestBodySchema
>;

export const OpenAICompatEmbeddingSchema = z.object({
  object: z.literal("embedding"),
  embedding: z.array(z.number()),
  index: z.number(),
});

export type OpenAICompatEmbedding = z.infer<typeof OpenAICompatEmbeddingSchema>;

export const OpenAICompatEmbeddingUsageSchema = z.object({
  prompt_tokens: z.number(),
  total_tokens: z.number(),
});

export type OpenAICompatEmbeddingUsage = z.infer<typeof OpenAICompatEmbeddingUsageSchema>;

export const OpenAICompatEmbeddingResponseBodySchema = z.object({
  object: z.literal("list"),
  data: z.array(OpenAICompatEmbeddingSchema),
  model: z.string(),
  usage: OpenAICompatEmbeddingUsageSchema,
  providerMetadata: z.optional(z.any()),
});

export type OpenAICompatEmbeddingResponseBody = z.infer<
  typeof OpenAICompatEmbeddingResponseBodySchema
>;
