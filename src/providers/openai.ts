import { createOpenAI, openai, OpenAIProviderSettings } from "@ai-sdk/openai";

import { withCanonicalIds } from "./registry";

export const openaiWithCanonicalIds = (extraMapping?: Record<string, string>) =>
  withCanonicalIds(openai, extraMapping, {
    stripNamespace: true,
  });

export const createOpenAIWithCanonicalIds = (
  settings: OpenAIProviderSettings,
  extraMapping?: Record<string, string>,
) =>
  withCanonicalIds(createOpenAI(settings), extraMapping, {
    stripNamespace: true,
  });
