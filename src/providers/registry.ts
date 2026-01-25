import type { CanonicalModelId, ModelCatalog, ModelId } from "#/models/types";
import type { EmbeddingModelV3, LanguageModelV3, ProviderV3 } from "@ai-sdk/provider";

import { customProvider, type ProviderRegistryProvider } from "ai";

export const resolveProvider = (
  providers: ProviderRegistryProvider,
  models: ModelCatalog,
  modelId: ModelId,
  modality: "text" | "image" | "audio" | "video" | "embeddings",
) => {
  const catalogModel = models[modelId];

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
    replaceDots?: boolean | readonly string[];
    prefix?: string;
    postfix?: string;
    /** @default "/" */
    namespaceSeparator?: "/" | "." | ":";
  },
) => {
  const {
    stripNamespace = true,
    replaceDots = false,
    prefix,
    postfix,
    namespaceSeparator = "/",
  } = options ?? {};

  const shouldReplaceDots = (canonicalId: string) => {
    if (replaceDots === true) return true;
    if (replaceDots === false) return false;
    return replaceDots.some((x) => canonicalId === x || canonicalId.startsWith(`${x}.`));
  };

  const normalizeId = (canonicalId: string) => {
    let out = canonicalId;

    if (namespaceSeparator === ".") {
      out = out.replace("/", ".");
    } else if (stripNamespace) {
      out = out.replace(/^[^/]+\//, "");
    }

    if (shouldReplaceDots(canonicalId)) {
      out = out.replaceAll(".", "-");
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
    stripNamespace || replaceDots || namespaceSeparator === "." || !!prefix || !!postfix;

  const fallbackProvider: ProviderV3 = needsFallbackWrap
    ? {
        ...provider,
        languageModel: (id: string) =>
          provider.languageModel(applyFallbackAffixes(normalizeId(id))),
        embeddingModel: (id: string) =>
          provider.embeddingModel(applyFallbackAffixes(normalizeId(id))),
      }
    : provider;

  const mapModels = <T>(fn: (id: string) => T) =>
    Object.fromEntries(Object.entries(mapping ?? {}).map(([k, v]) => [k, fn(applyPrefix(v))]));

  return customProvider({
    languageModels: mapModels(provider.languageModel) satisfies Partial<
      Record<CanonicalModelId, LanguageModelV3>
    >,
    embeddingModels: mapModels(provider.embeddingModel) satisfies Partial<
      Record<CanonicalModelId, EmbeddingModelV3>
    >,
    fallbackProvider,
  });
};
