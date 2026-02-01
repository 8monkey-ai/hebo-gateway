import * as z from "zod";

export const ModelCoreSchema = z.object({
  id: z.string(),
  object: z.literal("model"),
  created: z.int().nonnegative(),
  owned_by: z.string(),
});
export type ModelCore = z.infer<typeof ModelCoreSchema>;

export const ModelSchema = z.looseObject({
  ...ModelCoreSchema.shape,
  name: z.string().optional(),
  knowledge: z.string().optional(),
  context: z.int().nonnegative().optional(),
  architecture: z
    .object({
      modality: z.string().optional(),
      input_modalities: z.array(z.string()).readonly().optional(),
      output_modalities: z.array(z.string()).readonly().optional(),
    })
    .optional(),
  endpoints: z.array(
    z.object({
      tag: z.string(),
    }),
  ),
  capabilities: z.array(z.string()).readonly().optional(),
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
