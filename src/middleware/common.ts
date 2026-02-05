import type { JSONObject } from "@ai-sdk/provider";
import type { EmbeddingModelMiddleware, LanguageModelMiddleware } from "ai";

import type { ProviderId } from "../providers/types";

function snakeToCamel(key: string): string {
  if (key.indexOf("_") === -1) return key;

  let out = "";

  for (let i = 0; i < key.length; i++) {
    const c = key[i]!;

    if (c === "_" && i + 1 < key.length) {
      const next = key[i + 1]!;
      if (next >= "a" && next <= "z") {
        out += next.toUpperCase();
        i++;
        continue;
      }
    }

    out += c;
  }

  return out;
}

function camelToSnake(key: string): string {
  if (!/[A-Z]/.test(key)) return key;

  let out = "";
  for (let i = 0; i < key.length; i++) {
    const c = key[i]!;
    out += c >= "A" && c <= "Z" ? "_" + c.toLowerCase() : c;
  }
  return out;
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

function snakizeKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map((v) => snakizeKeysDeep(v));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined || v === null) continue;
    out[camelToSnake(k)] = snakizeKeysDeep(v);
  }
  return out;
}

function processOptions(providerOptions: Record<string, JSONObject>, providerName: ProviderId) {
  providerOptions[providerName] = camelizeKeysDeep({
    ...providerOptions[providerName],
    ...providerOptions["unknown"],
  }) as JSONObject;
  delete providerOptions["unknown"];
}

function processMetadata(providerMetadata: Record<string, JSONObject>) {
  for (const key in providerMetadata) {
    providerMetadata[key] = snakizeKeysDeep(providerMetadata[key]) as JSONObject;
  }
}

/**
 * Converts snake_case params in providerOptions to camelCase
 * and moves all of them into providerOptions[providerName].
 * Also snakizes values in providerMetadata for OpenAI compatibility.
 */
export function forwardLanguageParams(providerName: ProviderId): LanguageModelMiddleware {
  return {
    specificationVersion: "v3",
    // eslint-disable-next-line require-await
    transformParams: async ({ params }) => {
      if (params.providerOptions) processOptions(params.providerOptions, providerName);

      for (const message of params.prompt) {
        if (message.providerOptions) {
          processOptions(message.providerOptions, providerName);
        }
        if (message.content && Array.isArray(message.content)) {
          for (const part of message.content) {
            if ("providerOptions" in part && part.providerOptions) {
              processOptions(part.providerOptions as Record<string, JSONObject>, providerName);
            }
          }
        }
      }

      return params;
    },
    wrapGenerate: async ({ doGenerate }) => {
      const result = await doGenerate();
      if (result.providerMetadata) processMetadata(result.providerMetadata);
      result.content?.forEach((part) => {
        if (part.providerMetadata) processMetadata(part.providerMetadata);
      });
      return result;
    },
    wrapStream: async ({ doStream }) => {
      const result = await doStream();
      result.stream = result.stream.pipeThrough(
        new TransformStream({
          transform(part, controller) {
            if ("providerMetadata" in part && part.providerMetadata) {
              processMetadata(part.providerMetadata);
            }
            controller.enqueue(part);
          },
        }),
      );
      return result;
    },
  };
}

export function forwardEmbeddingParams(providerName: ProviderId): EmbeddingModelMiddleware {
  return {
    specificationVersion: "v3",
    // eslint-disable-next-line require-await
    transformParams: async ({ params }) => {
      if (params.providerOptions) processOptions(params.providerOptions, providerName);
      return params;
    },
    wrapEmbed: async ({ doEmbed }) => {
      const result = await doEmbed();
      if (result.providerMetadata) processMetadata(result.providerMetadata);
      return result;
    },
  };
}

export function extractProviderNamespace(id: string): string {
  if (id === "amazon-bedrock") return "bedrock";

  const parts = id.split(".");
  const first = parts[0]!;
  if (first === "google") {
    return parts[1] === "vertex" ? "vertex" : "google";
  }

  return first;
}

export function forwardParamsMiddleware(provider: string): LanguageModelMiddleware {
  return forwardLanguageParams(extractProviderNamespace(provider));
}

export function forwardParamsEmbeddingMiddleware(provider: string): EmbeddingModelMiddleware {
  return forwardEmbeddingParams(extractProviderNamespace(provider));
}
