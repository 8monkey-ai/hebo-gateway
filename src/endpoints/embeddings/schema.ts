import * as z from "zod";

export const EmbeddingsInputsSchema = z.object({
  input: z.union([z.string(), z.array(z.string())]),
  dimensions: z.int().nonnegative().max(65536).optional(),
});
export type EmbeddingsInputs = z.infer<typeof EmbeddingsInputsSchema>;

export const EmbeddingsBodyCoreSchema = z.object({
  model: z.string(),
  ...EmbeddingsInputsSchema.shape,
});
export type EmbeddingsBodyCore = z.infer<typeof EmbeddingsBodyCoreSchema>;

export const EmbeddingsBodySchema = z.looseObject({
  model: z.string(),
  ...EmbeddingsInputsSchema.shape,
});
export type EmbeddingsBody = z.infer<typeof EmbeddingsBodySchema>;

export const EmbeddingsDataSchema = z.object({
  object: z.literal("embedding"),
  embedding: z.array(z.number()),
  index: z.int().nonnegative(),
});
export type EmbeddingsData = z.infer<typeof EmbeddingsDataSchema>;

export const EmbeddingsUsageSchema = z.object({
  prompt_tokens: z.int().nonnegative().optional(),
  total_tokens: z.int().nonnegative().optional(),
});
export type EmbeddingsUsage = z.infer<typeof EmbeddingsUsageSchema>;

export const EmbeddingsCoreSchema = z.object({
  object: z.literal("list"),
  data: z.array(EmbeddingsDataSchema),
  model: z.string(),
  usage: EmbeddingsUsageSchema.nullable(),
});
export type EmbeddingsCore = z.infer<typeof EmbeddingsCoreSchema>;

export const EmbeddingsSchema = z.object({
  ...EmbeddingsCoreSchema.shape,
  provider_metadata: z.optional(z.any()),
});
export type Embeddings = z.infer<typeof EmbeddingsSchema>;
