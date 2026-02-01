import * as z from "zod/mini";

export const ModelCoreSchema = z.object({
  id: z.string(),
  object: z.literal("model"),
  created: z.number(),
  owned_by: z.string(),
});
export type ModelCore = z.infer<typeof ModelCoreSchema>;

export const ModelSchema = z.looseObject({
  ...ModelCoreSchema.shape,
  description: z.optional(z.string()),
  architecture: z.optional(
    z.object({
      modality: z.optional(z.string()),
      input_modalities: z.optional(z.readonly(z.array(z.string()))),
      output_modalities: z.optional(z.readonly(z.array(z.string()))),
    }),
  ),
  endpoints: z.array(
    z.object({
      tag: z.string(),
    }),
  ),
});
export type Model = z.infer<typeof ModelSchema>;

export const ModelListCoreSchema = z.object({
  object: z.literal("list"),
  data: z.array(ModelCoreSchema),
});
export type ModelListCore = z.infer<typeof ModelListCoreSchema>;

export const ModelListSchema = z.object({
  object: z.literal("list"),
  data: z.array(ModelSchema),
});
export type ModelList = z.infer<typeof ModelListSchema>;
