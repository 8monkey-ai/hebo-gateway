import { type ProviderV3, type ProviderV4 } from "@ai-sdk/provider";

/**
 * Provider instance accepted by the gateway.
 * Both the current (`v4`) and previous (`v3`) provider specifications are
 * supported, since community providers may still target `v3`.
 */
export type GatewayProvider = ProviderV3 | ProviderV4;

export const CANONICAL_PROVIDER_IDS = [
  "alibaba",
  "anthropic",
  "azure",
  "bedrock",
  "chutes",
  "cohere",
  "deepinfra",
  "deepseek",
  "fireworks",
  "groq",
  "minimax",
  "moonshot",
  "openai",
  "togetherai",
  "vertex",
  "voyage",
  "xai",
  "zai",
] as const;

export type CanonicalProviderId = (typeof CANONICAL_PROVIDER_IDS)[number];
// oxlint-disable-next-line ban-types
export type ProviderId = CanonicalProviderId | (string & {});

export type ProviderRegistry = {
  [K in ProviderId]?: GatewayProvider;
};
