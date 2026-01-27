import type { ProviderV3 } from "@ai-sdk/provider";

import { customProvider, type ProviderRegistryProvider } from "ai";

import type { ModelCatalog, ModelId } from "../models/types";

export const resolveProvider = (args: {
  providers: ProviderRegistryProvider;
  models: ModelCatalog;
  modelId: ModelId;
  operation: "text" | "embeddings";
}) => {
  const { providers, models, modelId, operation } = args;

  const catalogModel = models[modelId];

  if (!catalogModel) {
    throw new Error(`Model '${modelId}' not found in catalog`);
  }

  if (!catalogModel.modalities.output.includes(operation)) {
    throw new Error(`Model '${modelId}' does not support '${operation}' output`);
  }

  const resolvedProvider = catalogModel.providers[0];

  if (!resolvedProvider) {
    throw new Error(`No providers configured for model '${modelId}'`);
  }

  switch (operation) {
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
      throw new Error(`Operation '${operation}' is not yet supported`);
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
        // FUTURE: use embeddingModel instead of textEmbeddingModel once voyage supports it
        embeddingModel: (id: string) =>
          provider.textEmbeddingModel!(applyFallbackAffixes(normalizeId(id))),
      }
    : provider;

  const mapModels = <T>(fn?: (id: string) => T) => {
    const out = {} as Record<string, T>;

    // Some providers don't have languageModel / embeddingModel
    if (fn === undefined) return out;

    for (const [k, v] of Object.entries(mapping ?? {})) {
      // This is lazy so that provider is only create once called
      Object.defineProperty(out, k, {
        get: () => fn(applyPrefix(v)),
      });
    }

    return out;
  };

  return customProvider({
    languageModels: mapModels(provider.languageModel),
    // FUTURE: use embeddingModel instead of textEmbeddingModel once voyage supports it
    embeddingModels: mapModels(provider.textEmbeddingModel),
    fallbackProvider,
  });
};
