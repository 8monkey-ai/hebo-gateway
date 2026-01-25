import type { LanguageModelV1, ProviderV3 } from "@ai-sdk/provider";

import { customProvider } from "ai";

import type { CanonicalModelId } from "../models/types";

export const createNormalizedGroq = (groq: ProviderV3) => {
  return customProvider({
    languageModels: {
      "openai/gpt-oss-20b": groq.languageModel("openai/gpt-oss-20b"),
      "openai/gpt-oss-120b": groq.languageModel("openai/gpt-oss-120b"),
    } satisfies Partial<Record<CanonicalModelId, LanguageModelV1>>,
  });
};
