import * as z from "zod/mini";

export const EmbeddingsInputsSchema = z.object({
  input: z.union([z.string(), z.array(z.string())]),
  encoding_format: z.optional(z.enum(["float", "base64"])),
  dimensions: z.optional(z.number()),
  user: z.optional(z.string()),
});
export type EmbeddingsInputs = z.infer<typeof EmbeddingsInputsSchema>;

export const EmbeddingsBodySchema = z.extend(EmbeddingsInputsSchema, {
  model: z.string(),
});
export type EmbeddingsBody = z.infer<typeof EmbeddingsBodySchema>;

export const EmbeddingsDataSchema = z.object({
  object: z.literal("embedding"),
  embedding: z.array(z.number()),
  index: z.number(),
});
export type EmbeddingsData = z.infer<typeof EmbeddingsDataSchema>;

export const EmbeddingsUsageSchema = z.object({
  prompt_tokens: z.number(),
  total_tokens: z.number(),
});
export type EmbeddingsUsage = z.infer<typeof EmbeddingsUsageSchema>;

export const EmbeddingsSchema = z.object({
  object: z.literal("list"),
  data: z.array(EmbeddingsDataSchema),
  model: z.string(),
  usage: EmbeddingsUsageSchema,
  providerMetadata: z.optional(z.any()),
});
export type Embeddings = z.infer<typeof EmbeddingsSchema>;
