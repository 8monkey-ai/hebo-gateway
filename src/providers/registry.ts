import type { EmbeddingModelV3, LanguageModelV3, ProviderV3 } from "@ai-sdk/provider";

import { customProvider, type ProviderRegistryProvider } from "ai";

import type { CanonicalModelId, ModelCatalog, ModelId } from "../models/types";

export const resolveProvider = (
  providers: ProviderRegistryProvider,
  models: ModelCatalog,
  modelId: ModelId,
  modality: "text" | "image" | "audio" | "video" | "embeddings",
) => {
  const catalogModel = models[modelId as ModelId];

  if (!catalogModel) {
    throw new Error(`Model '${modelId}' not found in catalog`);
  }

  if (modality && !catalogModel.modalities.output.includes(modality)) {
    throw new Error(`Model '${modelId}' does not support '${modality}' output`);
  }

  const resolvedProvider = catalogModel.providers[0];

  if (!resolvedProvider) {
    throw new Error(`No providers configured for model '${modelId}'`);
  }

  switch (modality) {
    case "text":
      return customProvider({
        languageModels: {
          [modelId]: providers.languageModel(`${resolvedProvider}:${modelId}`),
        },
      });
    case "embeddings":
      return customProvider({
        embeddingModels: {
          [modelId]: providers.embeddingModel(`${resolvedProvider}:${modelId}`),
        },
      });
    default:
      throw new Error(`Modality '${modality}' is not yet supported`);
  }
};

export const withCanonicalIds = (
  provider: ProviderV3,
  mapping?: Record<string, string>,
  options?: {
    /** @default true */
    stripNamespace?: boolean;
    /** @default false */
    normalizeDelimiters?: boolean | readonly string[];
    prefix?: string;
    postfix?: string;
    /** @default "/" */
    namespaceSeparator?: "/" | "." | ":";
  },
) => {
  const {
    stripNamespace = true,
    normalizeDelimiters = false,
    prefix,
    postfix,
    namespaceSeparator = "/",
  } = options ?? {};

  const shouldNormalizeDelimiters = (canonicalId: string) => {
    if (typeof normalizeDelimiters === "boolean") return normalizeDelimiters;
    return normalizeDelimiters.some((x) => canonicalId.startsWith(`${x}/`));
  };

  const normalizeId = (canonicalId: string) => {
    let out = canonicalId;

    if (shouldNormalizeDelimiters(canonicalId)) {
      out = out.replaceAll(".", "-");
    }
    if (stripNamespace) {
      out = out.replace(/^[^/]+\//, "");
    } else if (namespaceSeparator !== "/") {
      out = out.replace("/", namespaceSeparator);
    }

    return out;
  };

  const applyPrefix = (v: string) => (prefix && !v.startsWith(prefix) ? `${prefix}${v}` : v);

  const applyFallbackAffixes = (v: string) => {
    let out = applyPrefix(v);
    if (postfix && !out.endsWith(postfix)) out = `${out}${postfix}`;
    return out;
  };

  const needsFallbackWrap =
    stripNamespace || normalizeDelimiters || namespaceSeparator !== "/" || !!prefix || !!postfix;

  const fallbackProvider: ProviderV3 = needsFallbackWrap
    ? {
        ...provider,
        specificationVersion: "v3",
        languageModel: (id: string) =>
          provider.languageModel(applyFallbackAffixes(normalizeId(id))),
        embeddingModel: (id: string) =>
          provider.textEmbeddingModel(applyFallbackAffixes(normalizeId(id))), // FUTURE: use embeddingModel instead of textEmbeddingModel once voyage supports it
      }
    : provider;

  const mapModels = <T>(fn: (id: string) => T) => {
    const out = {} as Record<string, T>;

    for (const [k, v] of Object.entries(mapping ?? {})) {
      // This is lazy so that provider is only create once called
      Object.defineProperty(out, k, {
        get: () => fn(applyPrefix(v)),
      });
    }

    return out;
  };

  return customProvider({
    languageModels: (provider.languageModel
      ? mapModels(provider.languageModel)
      : {}) satisfies Partial<Record<CanonicalModelId, LanguageModelV3>>,
    embeddingModels: (provider.embeddingModel
      ? mapModels(provider.embeddingModel)
      : {}) satisfies Partial<Record<CanonicalModelId, EmbeddingModelV3>>,
    fallbackProvider,
  });
};
