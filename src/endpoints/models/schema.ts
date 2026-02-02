import * as z from "zod";

export const ModelSchema = z.looseObject({
  // Core
  id: z.string(),
  object: z.literal("model"),
  created: z.int().nonnegative(),
  owned_by: z.string(),
  // Extensions
  name: z.string().optional().meta({ extension: true }),
  knowledge: z.string().optional().meta({ extension: true }),
  context: z.int().nonnegative().optional().meta({ extension: true }),
  architecture: z
    .object({
      modality: z.string().optional(),
      input_modalities: z.array(z.string()).readonly().optional(),
      output_modalities: z.array(z.string()).readonly().optional(),
    })
    .optional()
    .meta({ extension: true }),
  endpoints: z
    .array(
      z.object({
        tag: z.string(),
      }),
    )
    .optional()
    .meta({ extension: true }),
  capabilities: z.array(z.string()).readonly().optional().meta({ extension: true }),
});
export type Model = z.infer<typeof ModelSchema>;

export const ModelListSchema = z.object({
  object: z.literal("list"),
  data: z.array(ModelSchema),
});
export type ModelList = z.infer<typeof ModelListSchema>;
