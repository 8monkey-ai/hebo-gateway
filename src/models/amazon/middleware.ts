import type { SharedV3ProviderOptions } from "@ai-sdk/provider";
import type { EmbeddingModelMiddleware, LanguageModelMiddleware } from "ai";

import type {
  ChatCompletionsCacheControl,
  ChatCompletionsReasoningConfig,
  ChatCompletionsReasoningEffort,
} from "../../endpoints/chat-completions/schema";

import { modelMiddlewareMatcher } from "../../middleware/matcher";

// Convert `dimensions` (OpenAI) to `embeddingDimension` (Nova)
export const novaDimensionsMiddleware: EmbeddingModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const dimensions = unknown["dimensions"] as number;
    if (!dimensions) return params;

    (params.providerOptions!["nova"] ??= {})["embeddingDimension"] = dimensions;
    delete unknown["dimensions"];

    return params;
  },
};

function mapNovaEffort(effort: ChatCompletionsReasoningEffort) {
  switch (effort) {
    case "minimal":
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "high":
    case "xhigh":
    case "max":
      return "high";
  }
}

export const novaReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    const reasoning = unknown["reasoning"] as ChatCompletionsReasoningConfig;
    if (!reasoning) return params;

    const target = (params.providerOptions!["amazon"] ??= {});

    if (!reasoning.enabled) {
      target["reasoningConfig"] = { type: "disabled" };
    } else if (reasoning.effort) {
      // FUTURE: warn if mapNovaEffort modified the effort
      target["reasoningConfig"] = {
        type: "enabled",
        maxReasoningEffort: mapNovaEffort(reasoning.effort),
      };
    } else {
      // FUTURE: warn if reasoning.max_tokens (unsupported) was ignored
      target["reasoningConfig"] = { type: "enabled" };
    }

    delete unknown["reasoning"];

    return params;
  },
};

function toBedrockCachePoint(cacheControl?: ChatCompletionsCacheControl) {
  const out: { type: "default"; ttl?: "5m" | "1h" } = {
    type: "default",
  };
  if (cacheControl?.ttl === "5m" || cacheControl?.ttl === "1h") {
    out.ttl = cacheControl.ttl;
  }
  return out;
}

// https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html
export const novaPromptCachingMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  // eslint-disable-next-line require-await
  transformParams: async ({ params }) => {
    const unknown = params.providerOptions?.["unknown"];
    if (!unknown) return params;

    let hasExplicitCacheControl = false;
    let firstUser, lastSystem;

    const processCacheControl = (providerOptions?: SharedV3ProviderOptions) => {
      if (!providerOptions) return;

      const entryUnknown = providerOptions["unknown"];
      const entryCacheControl = entryUnknown?.["cache_control"] as ChatCompletionsCacheControl;
      if (!entryUnknown || !entryCacheControl) return;

      hasExplicitCacheControl = true;
      entryUnknown["cache_point"] = toBedrockCachePoint(entryCacheControl);
      delete entryUnknown["cache_control"];
    };

    for (const message of params.prompt) {
      if (message["role"] === "system") lastSystem = message;
      if (!firstUser && message["role"] === "user") firstUser = message;

      processCacheControl(message["providerOptions"]);

      if (!Array.isArray(message["content"])) continue;
      for (const part of message["content"]) {
        processCacheControl(part["providerOptions"]);
      }
    }

    const cacheControl = unknown["cache_control"] as ChatCompletionsCacheControl;
    if (cacheControl && !hasExplicitCacheControl) {
      const target = lastSystem ?? firstUser;
      if (target) {
        ((target["providerOptions"] ??= {})["unknown"] ??= {})["cache_point"] =
          toBedrockCachePoint(cacheControl);
      }
    }

    delete unknown["cache_control"];

    return params;
  },
};

modelMiddlewareMatcher.useForModel("amazon/nova-*embeddings*", {
  embedding: [novaDimensionsMiddleware],
});

modelMiddlewareMatcher.useForModel("amazon/nova-2-*", {
  language: [novaReasoningMiddleware, novaPromptCachingMiddleware],
});
