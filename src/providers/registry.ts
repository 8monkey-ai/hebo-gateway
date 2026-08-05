import type { ProviderV3, ProviderV4 } from "@ai-sdk/provider";
import { customProvider, type EmbeddingModel, type LanguageModel } from "ai";

import { GatewayError } from "../errors/gateway";
import { logger } from "../logger";
import type { ModelCatalog, ModelId } from "../models/types";
import type { ProviderRegistry } from "./types";

export const resolveProvider = (args: {
  providers: ProviderRegistry;
  models: ModelCatalog;
  modelId: ModelId;
  operation: "chat" | "embeddings" | "messages" | "responses";
}): ProviderV4 => {
  const { providers, models, modelId, operation } = args;

  const catalogModel = models[modelId];

  if (!catalogModel) {
    throw new GatewayError(`Model '${modelId}' not found in catalog`, 422, "MODEL_NOT_FOUND");
  }

  const modality = operation === "embeddings" ? "embedding" : "text";
  if (catalogModel.modalities && !catalogModel.modalities.output.includes(modality)) {
    throw new GatewayError(
      `Model '${modelId}' does not support '${modality}' output`,
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

/**
 * `provider` also accepts the previous (`v3`) specification because some
 * community providers still target it (voyage, zhipu). The returned provider is
 * always `v4`: `customProvider` normalizes the fallback for us.
 */
export const withCanonicalIds = (
  provider: ProviderV3 | ProviderV4,
  config: CanonicalIdsOptions = {},
): ProviderV4 => {
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

  const languageModel: (id: string) => LanguageModel = (id) => provider.languageModel(id);
  const embeddingModel: (id: string) => EmbeddingModel = (id) => provider.embeddingModel(id);

  const fallbackProvider = needsFallbackWrap
    ? ({
        ...provider,
        // Community providers may omit `specificationVersion`. Anything that is
        // not explicitly `v4` must report `v3`, otherwise the AI SDK adapts it
        // through its v2 shim, which reads the deprecated `textEmbeddingModel`
        // and would bypass the overrides below.
        specificationVersion: provider.specificationVersion === "v4" ? "v4" : "v3",
        languageModel: (id: string) => {
          const mapped = applyFallbackAffixes(normalizeId(id));
          logger.debug(`[canonical] mapped ${id} to ${mapped}`);
          return languageModel(mapped);
        },
        embeddingModel: (id: string) => {
          const mapped = applyFallbackAffixes(normalizeId(id));
          logger.debug(`[canonical] mapped ${id} to ${mapped}`);
          return embeddingModel(mapped);
        },
      } as ProviderV3 | ProviderV4)
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
          logger.debug(`[canonical] mapped ${k} to ${mapped}`);
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
