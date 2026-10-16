import type {
  JSONObject,
  TranscriptionModelV4CallOptions,
  TranscriptionModelV4Result,
} from "@ai-sdk/provider";
import type { EmbeddingModelMiddleware, LanguageModelMiddleware } from "ai";

import type { ProviderId } from "../providers/types";

function snakeToCamel(key: string): string {
  // oxlint-disable-next-line prefer-includes
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
    // oxlint-disable-next-line require-await
    transformParams: async ({ params }) => {
      if (params.providerOptions) processOptions(params.providerOptions, providerName);

      for (const message of params.prompt) {
        if (message.providerOptions) {
          processOptions(message.providerOptions, providerName);
        }
        if (message.content && Array.isArray(message.content)) {
          for (const part of message.content) {
            if ("providerOptions" in part && part.providerOptions) {
              processOptions(part.providerOptions, providerName);
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
    // oxlint-disable-next-line require-await
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
  // Bedrock Mantle models are OpenAI models, and those only read `openai` provider options.
  if (first === "bedrock-mantle") return "openai";
  // The nested Bedrock Anthropic provider (InvokeModel) is an Anthropic model, so it only
  // reads `anthropic` provider options — unlike the Converse models behind `amazon-bedrock`.
  if (first === "bedrock" && second === "anthropic") return "anthropic";
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

// The Azure SDK routes these model IDs to the Speech API (matched case-insensitively).
export const isMaiTranscribeModel = (modelId: string) =>
  modelId.toLowerCase().startsWith("mai-transcribe");

/**
 * Transcription counterpart of `forwardParamsMiddleware`.
 * The AI SDK has no transcription model middleware, so this transforms call options
 * and results directly: snake_case params in providerOptions are converted to camelCase
 * and moved into providerOptions[providerName], and providerMetadata is snakized.
 */
export function forwardTranscriptionParams(provider: string, modelId: string) {
  const namespace = extractProviderNamespace(provider);
  // Azure OpenAI deployments only read `openai` provider options; MAI-Transcribe models
  // go to the Azure Speech API, which reads `azure` options.
  const providerName =
    namespace === "azure" && !isMaiTranscribeModel(modelId) ? "openai" : namespace;

  return {
    transformParams: <T extends TranscriptionModelV4CallOptions>(params: T): T => {
      // Skip empty options: some providers apply extra defaults once their namespace exists.
      if (params.providerOptions && Object.keys(params.providerOptions).length > 0) {
        processOptions(params.providerOptions, providerName);
      }
      return params;
    },
    transformResult: <T extends TranscriptionModelV4Result>(result: T): T => {
      if (result.providerMetadata) processMetadata(result.providerMetadata);
      return result;
    },
  };
}
