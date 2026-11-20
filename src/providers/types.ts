import { type ProviderV4 } from "@ai-sdk/provider";

/**
 * Gateway providers with an adapter in `@hebo-ai/gateway/providers/<provider>`, in routing
 * preference order: when several serve a model, the catalog lists them in this order (after
 * the lab's own provider). Labs first, then clouds, then hosts.
 */
export const CANONICAL_PROVIDER_IDS = [
  "anthropic",
  "openai",
  "alibaba",
  "cohere",
  "deepseek",
  "minimax",
  "moonshot",
  "xai",
  "zai",
  "voyage",
  "bedrock",
  "vertex",
  "azure",
  "groq",
  "togetherai",
  "deepinfra",
  "fireworks",
  "chutes",
] as const;

export type CanonicalProviderId = (typeof CANONICAL_PROVIDER_IDS)[number];
// oxlint-disable-next-line ban-types
export type ProviderId = CanonicalProviderId | (string & {});

export type ProviderRegistry = {
  [K in ProviderId]?: ProviderV4;
};
