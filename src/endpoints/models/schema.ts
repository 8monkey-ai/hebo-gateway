import { z } from "zod";

export const OpenAICompatibleModelSchema = z
  .object({
    id: z.string(),
    object: z.literal("model"),
    created: z.number(),
    owned_by: z.string(),
    description: z.string().optional(),
    architecture: z
      .object({
        modality: z.string().optional(),
        input_modalities: z.array(z.string()).readonly(),
        output_modalities: z.array(z.string()).readonly(),
      })
      .optional(),
    endpoints: z.array(
      z.object({
        tag: z.string(),
      }),
    ),
  })
  .passthrough();

export type OpenAICompatibleModel = z.infer<typeof OpenAICompatibleModelSchema>;

export interface OpenAICompatibleList<T> {
  object: "list";
  data: T[];
}

export const OpenAICompatibleModelListSchema = z.object({
  object: z.literal("list"),
  data: z.array(OpenAICompatibleModelSchema),
});
