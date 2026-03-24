import * as z from "zod";

/**
 * Shared Open Responses item schemas used by both /conversations and /responses.
 */

/**
 * --- Metadata ---
 */

// Note: The 16-key limit is not currently validated.
export const CacheControlSchema = z.object({
  type: z.literal("ephemeral"),
  ttl: z.string().optional(),
});
export type CacheControl = z.infer<typeof CacheControlSchema>;

export const ReasoningEffortSchema = z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]);
export type ReasoningEffort = z.infer<typeof ReasoningEffortSchema>;

export const ReasoningConfigSchema = z.object({
  enabled: z.optional(z.boolean()),
  effort: z.optional(ReasoningEffortSchema),
  max_tokens: z.optional(z.number()),
  exclude: z.optional(z.boolean()),
});
export type ReasoningConfig = z.infer<typeof ReasoningConfigSchema>;

export const ServiceTierSchema = z.enum(["auto", "default", "flex", "scale", "priority"]);
export type ServiceTier = z.infer<typeof ServiceTierSchema>;
