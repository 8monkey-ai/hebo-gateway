import type { JSONObject } from "@ai-sdk/provider";
import type { EmbeddingModelMiddleware, LanguageModelMiddleware } from "ai";

import type { ProviderId } from "../providers/types";

function snakeToCamel(key: string): string {
  return key.replaceAll(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function camelizeKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map((v) => camelizeKeysDeep(v));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined || v === null) continue;
    out[snakeToCamel(k)] = camelizeKeysDeep(v);
  }
  return out;
}

/**
 * Converts snake_case params in providerOptions to camelCase
 * and moves all of them into providerOptions[providerName].
 */
type Kind = "embedding" | "language";
type MiddlewareFor<K extends Kind> = K extends "embedding"
  ? EmbeddingModelMiddleware
  : LanguageModelMiddleware;
type TransformOptsFor<K extends Kind> = Parameters<
  NonNullable<MiddlewareFor<K>["transformParams"]>
>[0];
function createNormalizedProviderMiddleware<K extends Kind>(
  _kind: K,
  providerName: ProviderId,
): MiddlewareFor<K> {
  return {
    specificationVersion: "v3" as const,
    // eslint-disable-next-line require-await
    transformParams: async (options: TransformOptsFor<K>) => {
      const { params } = options;
      const providerOptions = params.providerOptions;
      if (!providerOptions) return params;

      const target = (providerOptions[providerName] ??= {});
      for (const key in providerOptions) {
        if (key === providerName) continue;
        Object.assign(target, camelizeKeysDeep(providerOptions[key]) as Record<string, JSONObject>);
        if (key === "unhandled") delete providerOptions[key];
      }

      return params;
    },
  } as MiddlewareFor<K>;
}

export function createNormalizedProviderEmbeddingMiddleware(
  providerName: ProviderId,
): EmbeddingModelMiddleware {
  return createNormalizedProviderMiddleware("embedding", providerName);
}

export function createNormalizedProviderLanguageMiddleware(
  providerName: ProviderId,
): LanguageModelMiddleware {
  return createNormalizedProviderMiddleware("language", providerName);
}
