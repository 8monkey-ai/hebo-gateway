import type { LanguageModelV3, LanguageModelV4, ProviderV3, ProviderV4 } from "@ai-sdk/provider";
import {
  customProvider,
  type EmbeddingModel,
  type LanguageModel,
  type TranscriptionModel,
} from "ai";

import { GatewayError } from "../errors/gateway.ts";
import { logger } from "../logger/index.ts";
import type { ModelCatalog, ModelId, ModelSpec } from "../models/types.ts";
import type { ProviderId, ProviderRegistry } from "./types.ts";

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

/** Canonical model ID -> how the provider serves it, filled from the catalog once it loads. */
export type ModelSpecMap = Map<ModelId, ModelSpec>;

const shared = new Map<string, ModelSpecMap>();

/**
 * Model specs of a provider ID, shared by every provider instance wrapped for it. Instances
 * created after the catalog loads (e.g. BYOK providers built per request in a
 * `resolveProvider` hook) resolve the same native IDs and specs as the configured one.
 */
export const modelSpecsFor = (providerId: ProviderId): ModelSpecMap => {
  let specs = shared.get(providerId);
  if (!specs) shared.set(providerId, (specs = new Map()));
  return specs;
};

type ServedModel = { readonly provider: string; readonly modelId: string };

const NO_SPEC: ModelSpec = Object.freeze({});

// SDK models by `provider:modelId` (native ID) -> the spec they were created with.
const served = new Map<string, ModelSpec>();

/**
 * Spec (models.dev data such as reasoning controls) of a model created by a provider wrapped
 * with `withCanonicalIds`, so middleware adapts to new models without a code change. Reads the
 * `model` passed to middleware: wrapped models keep the inner `provider` and `modelId`. Empty
 * for models without one (e.g. custom models).
 */
export const specOf = (model: ServedModel): ModelSpec =>
  served.get(`${model.provider}:${model.modelId}`) ?? NO_SPEC;

/** Records the spec `specOf` returns for `model`. */
export const setModelSpec = <M extends ServedModel>(model: M, spec: ModelSpec | undefined): M => {
  if (spec) served.set(`${model.provider}:${model.modelId}`, spec);
  return model;
};

/** A catalog spec that carries a native ID. */
export type NativeModelSpec = ModelSpec & { id: string };

export type CanonicalIdsOptions = {
  /**
   * Gateway provider ID (e.g. `bedrock`), as the provider is keyed in `config.providers`.
   * Every instance wrapped for it shares the model specs loaded from the catalog (see
   * `modelSpecsFor`).
   */
  providerId: ProviderId;
  /**
   * Canonical -> provider-native IDs that win over the catalog. Values may use `{key}`
   * placeholders from `options.template`.
   */
  mapping?: Partial<Record<ModelId, string>>;
  /**
   * Native ID to call the provider with for a catalog spec, e.g. to apply its Bedrock
   * inference profile. @default spec.id
   */
  nativeId?: (spec: NativeModelSpec) => string;
  /** Transform for model IDs that neither `mapping` nor the catalog knows. */
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
 * A provider to wrap. Its `languageModel` also receives the catalog spec of the model, e.g. to
 * route it (Bedrock Mantle).
 */
export type CanonicalIdsProvider = (ProviderV3 | ProviderV4) & {
  languageModel(modelId: string, spec?: ModelSpec): LanguageModelV3 | LanguageModelV4;
};

/**
 * `provider` also accepts the previous (`v3`) specification because some
 * community providers still target it (voyage, zhipu). The returned provider is
 * always `v4`: `customProvider` normalizes the fallback for us.
 */
export const withCanonicalIds = (provider: CanonicalIdsProvider, config: CanonicalIdsOptions) => {
  const {
    providerId,
    mapping,
    nativeId = (spec: NativeModelSpec) => spec.id,
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

  const placeholders =
    template && Object.entries(template).map(([k, v]) => [`{${k}}`, v ?? ""] as const);
  const applyTemplate = (input: string) => {
    if (!placeholders || !input.includes("{")) return input;
    return placeholders.reduce((out, [k, v]) => out.replace(k, v), input);
  };

  const applyFallbackAffixes = (v: string) => {
    let out = prefix && !v.startsWith(prefix) ? `${prefix}${v}` : v;
    if (postfix && !out.endsWith(postfix)) out = `${out}${postfix}`;
    return out;
  };

  const specs = modelSpecsFor(providerId);

  // Explicit mapping, then the catalog, then the fallback transform. Only explicit mappings
  // are templated: catalog IDs come from upstream data.
  const resolve = (id: string, spec: ModelSpec | undefined) => {
    const explicit = mapping?.[id];
    const mapped =
      explicit === undefined
        ? spec?.id === undefined
          ? applyFallbackAffixes(normalizeId(id))
          : nativeId(spec as NativeModelSpec)
        : applyTemplate(explicit);
    if (mapped !== id) logger.debug(`[canonical] mapped ${id} to ${mapped}`);
    return mapped;
  };

  // Each model records its spec, read by middleware with `specOf`.
  const languageModel = (id: string): LanguageModel => {
    const spec = specs.get(id);
    return setModelSpec(provider.languageModel(resolve(id, spec), spec), spec);
  };
  const embeddingModel = (id: string): EmbeddingModel => {
    const spec = specs.get(id);
    return setModelSpec(provider.embeddingModel(resolve(id, spec)), spec);
  };
  // Optional in the provider spec: only wrapped when the provider supports transcription.
  const transcriptionModel: ((id: string) => TranscriptionModel) | undefined =
    provider.transcriptionModel &&
    ((id) => {
      const spec = specs.get(id);
      return setModelSpec(provider.transcriptionModel!(resolve(id, spec)), spec);
    });

  return customProvider({
    fallbackProvider: {
      ...provider,
      // Community providers may omit `specificationVersion`. Anything that is
      // not explicitly `v4` must report `v3`, otherwise the AI SDK adapts it
      // through its v2 shim, which reads the deprecated `textEmbeddingModel`
      // and would bypass the overrides below.
      specificationVersion: provider.specificationVersion === "v4" ? "v4" : "v3",
      languageModel,
      embeddingModel,
      ...(transcriptionModel && { transcriptionModel }),
    } as ProviderV3 | ProviderV4,
  });
};
