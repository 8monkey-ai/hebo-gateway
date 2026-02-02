import type { EmbeddingModelMiddleware, LanguageModelMiddleware } from "ai";

import type {
  ChatCompletionsReasoningConfig,
  ChatCompletionsReasoningEffort,
} from "../../endpoints/chat-completions/schema";

import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { calculateReasoningBudgetFromEffort } from "../../middleware/utils";

// Convert `dimensions` (OpenAI) to `outputDimensionality` (Google)
export const geminiEmbeddingModelMiddleware: EmbeddingModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    let dimensions = unknown["dimensions"] as number;
    if (!dimensions) dimensions = 1024;

    (params.providerOptions!["gemini"] ??= {})["outputDimensionality"] = dimensions;
    delete unknown["dimensions"];

    return params;
  },
};

type ThinkingConfig = {
  includeThoughts: boolean;
  thinkingBudget?: number;
};

const GEMINI_DEFAULT_MAX_OUTPUT_TOKENS = 65536;

function createGeminiReasoningEffortMiddleware(config: {
  mapEffort: (effort: ChatCompletionsReasoningEffort) => ChatCompletionsReasoningEffort | undefined;
}): LanguageModelMiddleware {
  return {
    specificationVersion: "v3",
    // eslint-disable-next-line require-await
    transformParams: async ({ params }) => {
      const unknown = params.providerOptions?.["unknown"];
      if (!unknown) return params;

      const reasoning = unknown["reasoning"] as ChatCompletionsReasoningConfig;
      if (!reasoning) return params;

      const target = (params.providerOptions!["gemini"] ??= {});

      if (!reasoning.enabled) {
        target["thinkingConfig"] = { includeThoughts: false } satisfies ThinkingConfig;
      } else if (reasoning.max_tokens) {
        target["thinkingConfig"] = {
          includeThoughts: true,
          thinkingBudget: reasoning.max_tokens,
        } satisfies ThinkingConfig;
      } else if (reasoning.effort) {
        target["thinkingConfig"] = { includeThoughts: true } satisfies ThinkingConfig;
        const mapped = config.mapEffort(reasoning.effort);
        if (mapped) target["reasoningEffort"] = mapped;
      }

      delete unknown["reasoning"];

      return params;
    },
  };
}

function createGeminiReasoningBudgetMiddleware(): LanguageModelMiddleware {
  return {
    specificationVersion: "v3",
    // eslint-disable-next-line require-await
    transformParams: async ({ params }) => {
      const unknown = params.providerOptions?.["unknown"];
      if (!unknown) return params;

      const reasoning = unknown["reasoning"] as ChatCompletionsReasoningConfig;
      if (!reasoning) return params;

      const target = (params.providerOptions!["gemini"] ??= {});

      if (!reasoning.enabled) {
        target["thinkingConfig"] = { includeThoughts: false } satisfies ThinkingConfig;
      } else if (reasoning.max_tokens) {
        target["thinkingConfig"] = {
          includeThoughts: true,
          thinkingBudget: reasoning.max_tokens,
        } satisfies ThinkingConfig;
      } else if (reasoning.effort) {
        target["thinkingConfig"] = {
          includeThoughts: true,
          thinkingBudget: calculateReasoningBudgetFromEffort(
            reasoning.effort,
            params.maxOutputTokens ?? GEMINI_DEFAULT_MAX_OUTPUT_TOKENS,
          ),
        } satisfies ThinkingConfig;
      }

      delete unknown["reasoning"];

      return params;
    },
  };
}

function mapGemini3ProEffort(effort: ChatCompletionsReasoningEffort) {
  switch (effort) {
    case "minimal":
    case "low":
      return "low";
    case "medium":
    case "high":
    case "xhigh":
      return "high";
  }
}

function mapGemini3FlashEffort(effort: ChatCompletionsReasoningEffort) {
  switch (effort) {
    case "minimal":
      return "minimal";
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "high":
    case "xhigh":
      return "high";
  }
}

modelMiddlewareMatcher.useForModel("google/gemini-*embedding-*", {
  embedding: geminiEmbeddingModelMiddleware,
});

modelMiddlewareMatcher.useForModel("google/gemini-3-pro*", {
  language: createGeminiReasoningEffortMiddleware({ mapEffort: mapGemini3ProEffort }),
});

modelMiddlewareMatcher.useForModel("google/gemini-3-flash*", {
  language: createGeminiReasoningEffortMiddleware({ mapEffort: mapGemini3FlashEffort }),
});

modelMiddlewareMatcher.useForModel("google/gemini-2*", {
  language: createGeminiReasoningBudgetMiddleware(),
});
