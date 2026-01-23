import * as z from "zod/mini";

export const OpenAICompatibleEmbeddingParamsSchema = z.object({
  input: z.union([z.string(), z.array(z.string())]),
  encoding_format: z.optional(z.enum(["float", "base64"])),
  dimensions: z.optional(z.number()),
  user: z.optional(z.string()),
});

export type OpenAICompatibleEmbeddingParams = z.infer<typeof OpenAICompatibleEmbeddingParamsSchema>;

export const OpenAICompatibleEmbeddingRequestBodySchema = z.extend(
  OpenAICompatibleEmbeddingParamsSchema,
  {
    model: z.string(),
  },
);

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
  providerMetadata: z.optional(z.any()),
});

export type OpenAICompatibleEmbeddingResponseBody = z.infer<
  typeof OpenAICompatibleEmbeddingResponseBodySchema
>;
