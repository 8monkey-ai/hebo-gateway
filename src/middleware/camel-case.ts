import type { JSONObject } from "@ai-sdk/provider";
import type { EmbeddingModelMiddleware } from "ai";

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
export function createCamelCaseProviderOptionsMiddleware(
  providerName: ProviderId,
): EmbeddingModelMiddleware {
  return {
    specificationVersion: "v3",
    // eslint-disable-next-line require-await
    transformParams: async ({ params }) => {
      const providerOptions = params.providerOptions;
      if (!providerOptions) return params;

      const target = (providerOptions[providerName] ??= {});
      for (const key in providerOptions) {
        if (key === providerName) continue;
        Object.assign(target, camelizeKeysDeep(providerOptions[key]) as Record<string, JSONObject>);
        delete providerOptions[key];
      }

      return params;
    },
  };
}
