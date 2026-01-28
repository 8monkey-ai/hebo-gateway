import {
  createAnthropic,
  anthropic,
  type AnthropicProviderSettings,
  type AnthropicProvider,
} from "@ai-sdk/anthropic";

import { withCanonicalIds } from "../registry";

export const anthropicCanonicalIdAdapter = (
  provider: AnthropicProvider,
  extraMapping?: Record<string, string>,
) =>
  withCanonicalIds(provider, extraMapping, {
    stripNamespace: true,
    normalizeDelimiters: true,
  });

export const anthropicWithCanonicalIds = (extraMapping?: Record<string, string>) =>
  withCanonicalIds(anthropic, extraMapping, {
    stripNamespace: true,
    normalizeDelimiters: true,
  });

export const createAnthropicWithCanonicalIds = (
  settings: AnthropicProviderSettings,
  extraMapping?: Record<string, string>,
) =>
  withCanonicalIds(createAnthropic(settings), extraMapping, {
    stripNamespace: true,
    normalizeDelimiters: true,
  });
