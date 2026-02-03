import type { EmbeddingModelMiddleware, LanguageModelMiddleware } from "ai";

import type {
  ChatCompletionsReasoningConfig,
  ChatCompletionsReasoningEffort,
} from "../../endpoints/chat-completions/schema";

import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { calculateReasoningBudgetFromEffort } from "../../middleware/utils";

// Convert `dimensions` (OpenAI) to `outputDimensionality` (Google)
export const geminiDimensionsMiddleware: EmbeddingModelMiddleware = {
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

export function mapGemini3ProEffort(effort: ChatCompletionsReasoningEffort) {
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

export function mapGemini3FlashEffort(effort: ChatCompletionsReasoningEffort) {
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

export const GEMINI_DEFAULT_MAX_OUTPUT_TOKENS = 65536;
export function createGeminiReasoningEffortMiddleware(config: {
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
        target["thinkingConfig"] = { includeThoughts: false };
      } else if (reasoning.max_tokens) {
        target["thinkingConfig"] = {
          includeThoughts: true,
          thinkingBudget: reasoning.max_tokens,
        };
      } else if (reasoning.effort) {
        // FUTURE: Issue warning if mapEffort modified value
        target["thinkingConfig"] = { includeThoughts: true };
        const mapped = config.mapEffort(reasoning.effort);
        if (mapped) target["reasoningEffort"] = mapped;
      }

      delete unknown["reasoning"];

      return params;
    },
  };
}

export function createGeminiReasoningBudgetMiddleware(): LanguageModelMiddleware {
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
        target["thinkingConfig"] = { includeThoughts: false };
      } else if (reasoning.max_tokens) {
        target["thinkingConfig"] = {
          includeThoughts: true,
          thinkingBudget: reasoning.max_tokens,
        };
      } else if (reasoning.effort) {
        // FUTURE: Issue warning that reasoning.max_tokens was computed
        target["thinkingConfig"] = {
          includeThoughts: true,
          thinkingBudget: calculateReasoningBudgetFromEffort(
            reasoning.effort,
            params.maxOutputTokens ?? GEMINI_DEFAULT_MAX_OUTPUT_TOKENS,
          ),
        };
      }

      delete unknown["reasoning"];

      return params;
    },
  };
}

modelMiddlewareMatcher.useForModel("google/gemini-*embedding-*", {
  embedding: geminiDimensionsMiddleware,
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
