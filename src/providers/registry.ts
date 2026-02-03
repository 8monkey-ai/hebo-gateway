import type { ProviderV3 } from "@ai-sdk/provider";

import { customProvider } from "ai";

import type { ModelCatalog, ModelId } from "../models/types";
import type { ProviderRegistry } from "./types";

export const resolveProvider = (args: {
  providers: ProviderRegistry;
  models: ModelCatalog;
  modelId: ModelId;
  operation: "text" | "embeddings";
}): ProviderV3 => {
  const { providers, models, modelId, operation } = args;

  const catalogModel = models[modelId];

  if (!catalogModel) {
    throw new Error(`Model '${modelId}' not found in catalog`);
  }

  if (catalogModel.modalities && !catalogModel.modalities.output.includes(operation)) {
    throw new Error(`Model '${modelId}' does not support '${operation}' output`);
  }

  // FUTURE: implement fallback logic [e.g. runtime config invalid]
  const resolvedProviderId = catalogModel.providers[0];

  if (!resolvedProviderId) {
    throw new Error(`No providers configured for model '${modelId}'`);
  }

  const provider = providers[resolvedProviderId];
  if (!provider) {
    throw new Error(`Provider '${resolvedProviderId}' not configured`);
  }

  return provider;
};

export type CanonicalIdsOptions = {
  mapping?: Partial<Record<ModelId, string>>;
  options?: {
    /** @default true */
    stripNamespace?: boolean;
    /** @default false */
    normalizeDelimiters?: boolean | readonly string[];
    prefix?: string;
    template?: Record<string, string | undefined>;
    postfix?: string;
    /** @default "/" */
    namespaceSeparator?: "/" | "." | ":";
  };
};

export const withCanonicalIds = (
  provider: ProviderV3,
  config: CanonicalIdsOptions = {},
): ProviderV3 => {
  const {
    mapping,
    options: {
      stripNamespace = true,
      normalizeDelimiters = false,
      template,
      prefix,
      postfix,
      namespaceSeparator = "/",
    } = {},
  } = config;

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

  const applyTemplate = (input: string) => {
    if (!template) return input;
    return Object.entries(template).reduce((out, [k, v]) => out.replace(`{${k}}`, v ?? ""), input);
  };

  const applyFallbackAffixes = (v: string) => {
    let out = prefix && !v.startsWith(prefix) ? `${prefix}${v}` : v;
    if (postfix && !out.endsWith(postfix)) out = `${out}${postfix}`;
    return out;
  };

  const needsFallbackWrap =
    stripNamespace || normalizeDelimiters || namespaceSeparator !== "/" || !!prefix || !!postfix;

  // FUTURE: use embeddingModel instead of textEmbeddingModel once voyage supports it
  const languageModel = provider.languageModel;
  const embeddingModel = provider.textEmbeddingModel!;

  const fallbackProvider = needsFallbackWrap
    ? ({
        ...provider,
        specificationVersion: "v3",
        languageModel: (id: string) => languageModel(applyFallbackAffixes(normalizeId(id))),
        embeddingModel: (id: string) => embeddingModel(applyFallbackAffixes(normalizeId(id))),
      } satisfies ProviderV3)
    : provider;

  const mapModels = <T>(fn?: (id: string) => T) => {
    const out = {} as Record<string, T>;

    // Some providers don't have languageModel / embeddingModel
    if (fn === undefined) return out;

    for (const [k, v] of Object.entries(mapping ?? {})) {
      if (v === undefined) continue;
      // This is lazy so that provider is only create once called
      Object.defineProperty(out, k, {
        get: () => fn(applyTemplate(v)),
      });
    }

    return out;
  };

  return customProvider({
    languageModels: mapModels(languageModel),
    embeddingModels: mapModels(embeddingModel),
    fallbackProvider,
  });
};
