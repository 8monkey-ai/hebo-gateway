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

function hasUppercase(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c >= "A" && c <= "Z") return true;
  }
  return false;
}

function camelToSnake(key: string): string {
  if (!hasUppercase(key)) return key;

  let out = "";
  for (let i = 0; i < key.length; i++) {
    const c = key[i]!;
    out += c >= "A" && c <= "Z" ? "_" + c.toLowerCase() : c;
  }
  return out;
}

function remapDeep(value: unknown, mapKey: (k: string) => string): unknown {
  if (value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map((v) => remapDeep(v, mapKey));
  }

  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    out[mapKey(key)] = remapDeep((value as Record<string, unknown>)[key], mapKey);
  }
  return out;
}

function processOptions(options: Record<string, JSONObject>, providerName: ProviderId) {
  const target = (options[providerName] = remapDeep(
    options[providerName] ?? {},
    snakeToCamel,
  ) as JSONObject) as Record<string, JSONObject>;

  for (const namespace in options) {
    if (namespace === providerName) continue;
    Object.assign(
      target,
      remapDeep(options[namespace], snakeToCamel) as Record<string, JSONObject>,
    );
    if (namespace === "unknown") delete options[namespace];
  }
}

function processMetadata(metadata: Record<string, JSONObject>) {
  for (const namespace in metadata) {
    metadata[namespace] = remapDeep(metadata[namespace], camelToSnake) as JSONObject;
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
  const [first, second] = id.split(".");
  // FUTURE: map vertex to google once AI SDK support per-message level provider options
  if (first === "vertex" || second === "vertex") return "vertex";
  return first!;
}

export function forwardParamsMiddleware(provider: string): LanguageModelMiddleware {
  return forwardLanguageParams(extractProviderNamespace(provider));
}

export function forwardParamsEmbeddingMiddleware(provider: string): EmbeddingModelMiddleware {
  return forwardEmbeddingParams(extractProviderNamespace(provider));
}
