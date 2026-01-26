import { type ProviderV3 } from "@ai-sdk/provider";

export const CANONICAL_PROVIDER_IDS = [
  "anthropic",
  "bedrock",
  "cohere",
  "groq",
  "openai",
  "vertex",
  "voyage",
] as const;

export type CanonicalProviderId = (typeof CANONICAL_PROVIDER_IDS)[number];
// eslint-disable-next-line ban-types
export type ProviderId = CanonicalProviderId | (string & {});

export type ProviderRegistry = {
  [K in ProviderId]?: ProviderV3;
};
