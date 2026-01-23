import * as z from "zod/mini";

export const OpenAICompatibleModelSchema = z.catchall(
  z.object({
    id: z.string(),
    object: z.literal("model"),
    created: z.number(),
    owned_by: z.string(),
    description: z.optional(z.string()),
    architecture: z.optional(
      z.object({
        modality: z.optional(z.string()),
        input_modalities: z.readonly(z.array(z.string())),
        output_modalities: z.readonly(z.array(z.string())),
      }),
    ),
    endpoints: z.array(
      z.object({
        tag: z.string(),
      }),
    ),
  }),
  z.unknown(),
);

export type OpenAICompatibleModel = z.infer<typeof OpenAICompatibleModelSchema>;

export interface OpenAICompatibleList<T> {
  object: "list";
  data: T[];
}

export const OpenAICompatibleModelListSchema = z.object({
  object: z.literal("list"),
  data: z.array(OpenAICompatibleModelSchema),
});
