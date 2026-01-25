import { createAnthropic, anthropic, AnthropicProviderSettings } from "@ai-sdk/anthropic";

import { withCanonicalIds } from "./registry";

export const anthropicWithCanonicalIds = (extraMapping?: Record<string, string>) =>
  withCanonicalIds(anthropic, extraMapping, {
    stripNamespace: true,
    replaceDots: true,
  });

export const createAnthropicWithCanonicalIds = (
  settings: AnthropicProviderSettings,
  extraMapping?: Record<string, string>,
) =>
  withCanonicalIds(createAnthropic(settings), extraMapping, {
    stripNamespace: true,
    replaceDots: true,
  });
