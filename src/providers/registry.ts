import type { ProviderV3, ProviderV4 } from "@ai-sdk/provider";
import {
  customProvider,
  type EmbeddingModel,
  type LanguageModel,
  type TranscriptionModel,
} from "ai";

import { GatewayError } from "../errors/gateway.ts";
import { logger } from "../logger/index.ts";
import type { ModelCatalog, ModelId } from "../models/types.ts";
import type { ProviderRegistry } from "./types.ts";

export const resolveProvider = (args: {
  providers: ProviderRegistry;
  models: ModelCatalog;
  modelId: ModelId;
  operation: "chat" | "embeddings" | "messages" | "responses" | "transcriptions";
}): ProviderV4 => {
  const { providers, models, modelId, operation } = args;

  const catalogModel = models[modelId];

  if (!catalogModel) {
    throw new GatewayError(`Model '${modelId}' not found in catalog`, 422, "MODEL_NOT_FOUND");
  }

  const modality =
    operation === "embeddings"
      ? "embeddings"
      : operation === "transcriptions"
        ? "transcription"
        : "text";
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

/** Kind of model a catalog entry is served as. */
export type CanonicalModelKind = "text" | "embeddings" | "transcription";

/** Whether a provider can serve a canonical model ID, i.e. knows its provider-native ID. */
export type CanonicalIdsResolver = (modelId: ModelId, kind: CanonicalModelKind) => boolean;

const kResolver = Symbol.for("hebo.gateway.canonical-ids");

/** Attaches a resolver to a provider, read back with `getCanonicalIdsResolver`. */
export const withCanonicalIdsResolver = <P extends ProviderV4>(
  provider: P,
  resolver: CanonicalIdsResolver,
): P => Object.assign(provider, { [kResolver]: resolver });

/** Resolver of a provider wrapped with `withCanonicalIds`, if any. */
export const getCanonicalIdsResolver = (provider: ProviderV4) =>
  (provider as { [kResolver]?: CanonicalIdsResolver })[kResolver];

export type CanonicalIdsOptions = {
  mapping?: Partial<Record<ModelId, string>>;
  /**
   * Canonical namespaces (e.g. `"anthropic"`) whose provider-native IDs the default
   * transform below produces. Other IDs are only served through `mapping`, so the catalog
   * does not route them to this provider. Defaults to every namespace.
   */
  namespaces?: readonly string[];
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
    namespaces,
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
      out = out.replace(/^[^/]+\//u, "");
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
  // Optional in the provider spec: only wrapped when the provider supports transcription.
  const transcriptionModel: ((id: string) => TranscriptionModel) | undefined =
    provider.transcriptionModel && ((id) => provider.transcriptionModel!(id));

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
        ...(transcriptionModel && {
          transcriptionModel: (id: string) => {
            const mapped = applyFallbackAffixes(normalizeId(id));
            logger.debug(`[canonical] mapped ${id} to ${mapped}`);
            return transcriptionModel(mapped);
          },
        }),
      } as ProviderV3 | ProviderV4)
    : provider;

  const mapModels = <T>(fn?: (id: string) => T) => {
    const out = {} as Record<string, T>;

    // Some providers don't have languageModel / embeddingModel / transcriptionModel
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

  const wrapped = customProvider({
    languageModels: mapModels(languageModel),
    embeddingModels: mapModels(embeddingModel),
    transcriptionModels: mapModels(transcriptionModel),
    fallbackProvider,
  });

  return withCanonicalIdsResolver(wrapped, (modelId, kind) => {
    if (kind === "transcription" && !transcriptionModel) return false;
    if (mapping?.[modelId] !== undefined) return true;
    return !namespaces || namespaces.includes(modelId.split("/", 1)[0]!);
  });
};
