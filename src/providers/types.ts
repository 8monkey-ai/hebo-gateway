import { type ProviderV3 } from "@ai-sdk/provider";

export const CANONICAL_PROVIDER_IDS = [
  "alibaba",
  "anthropic",
  "azure",
  "bedrock",
  "chutes",
  "cohere",
  "deepinfra",
  "fireworks",
  "groq",
  "minimax",
  "openai",
  "togetherai",
  "vertex",
  "voyage",
  "xai",
  "zhipu",
] as const;

export type CanonicalProviderId = (typeof CANONICAL_PROVIDER_IDS)[number];
// oxlint-disable-next-line ban-types
export type ProviderId = CanonicalProviderId | (string & {});

export type ProviderRegistry = {
  [K in ProviderId]?: ProviderV3;
};
