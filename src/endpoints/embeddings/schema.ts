import * as z from "zod";

import { TraceSchema } from "../shared/schema";

export const EmbeddingsDimensionsSchema = z.int().nonnegative().max(65536);
export type EmbeddingsDimensions = z.infer<typeof EmbeddingsDimensionsSchema>;

export const EmbeddingsMetadataSchema = z.record(z.string().min(1).max(64), z.string().max(512));
export type EmbeddingsMetadata = z.infer<typeof EmbeddingsMetadataSchema>;

export const EmbeddingsInputsSchema = z.object({
  input: z.union([z.string(), z.array(z.string())]),
  dimensions: EmbeddingsDimensionsSchema.optional(),
  metadata: EmbeddingsMetadataSchema.optional(),
});
export type EmbeddingsInputs = z.infer<typeof EmbeddingsInputsSchema>;

export const EmbeddingsBodySchema = z.looseObject({
  model: z.string(),
  trace: TraceSchema,
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

export const EmbeddingsSchema = z.object({
  object: z.literal("list"),
  data: z.array(EmbeddingsDataSchema),
  model: z.string(),
  usage: EmbeddingsUsageSchema.nullable(),
  // Extensions
  provider_metadata: z.unknown().optional().meta({ extension: true }),
});
export type Embeddings = z.infer<typeof EmbeddingsSchema>;
