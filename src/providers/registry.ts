import type { ProviderV3 } from "@ai-sdk/provider";

import { customProvider } from "ai";

import type { ModelCatalog, ModelId } from "../models/types";
import type { ProviderRegistry } from "./types";

import { GatewayError } from "../utils/errors";
import { logger } from "../utils/logger";

export const resolveProvider = (args: {
  providers: ProviderRegistry;
  models: ModelCatalog;
  modelId: ModelId;
  operation: "text" | "embeddings";
}): ProviderV3 => {
  const { providers, models, modelId, operation } = args;

  const catalogModel = models[modelId];

  if (!catalogModel) {
    throw new GatewayError(`Model '${modelId}' not found in catalog`, 422, "MODEL_NOT_FOUND");
  }

  if (catalogModel.modalities && !catalogModel.modalities.output.includes(operation)) {
    throw new GatewayError(
      `Model '${modelId}' does not support '${operation}' output`,
      422,
      "MODEL_UNSUPPORTED_OPERATION",
    );
  }

  // FUTURE: implement fallback logic [e.g. runtime config invalid]
  const resolvedProviderId = catalogModel.providers[0];

  if (!resolvedProviderId) {
    throw new GatewayError(`No providers configured for model '${modelId}'`, 422, "NO_PROVIDERS");
  }

  const provider = providers[resolvedProviderId];
  if (!provider) {
    throw new GatewayError(
      `Provider '${resolvedProviderId}' not configured`,
      422,
      "PROVIDER_NOT_CONFIGURED",
    );
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
        languageModel: (id: string) => {
          const mapped = applyFallbackAffixes(normalizeId(id));
          logger.debug(`[canonical] language id mapped: ${id} -> ${mapped}`);
          return languageModel(mapped);
        },
        embeddingModel: (id: string) => {
          const mapped = applyFallbackAffixes(normalizeId(id));
          logger.debug(`[canonical] embedding id mapped: ${id} -> ${mapped}`);
          return embeddingModel(mapped);
        },
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
        get: () => {
          const mapped = applyTemplate(v);
          logger.debug(`[canonical] mapped id: ${k} -> ${mapped}`);
          return fn(mapped);
        },
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
