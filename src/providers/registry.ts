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
  let resolvedProviderId: string | undefined;
  for (const id in catalogModel.providers) {
    resolvedProviderId = id;
    break;
  }

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

const kNativeIds = Symbol.for("hebo.gateway.native-ids");

/** Canonical -> provider-native model IDs, filled from the catalog once it is loaded. */
export type NativeIds = Map<ModelId, string>;

/** Attaches a native ID map to a provider, read back with `getNativeIds`. */
export const withNativeIds = <P extends ProviderV4>(provider: P, ids: NativeIds): P =>
  Object.assign(provider, { [kNativeIds]: ids });

/** Native ID map of a provider wrapped with `withCanonicalIds`, if any. */
export const getNativeIds = (provider: ProviderV4) =>
  (provider as { [kNativeIds]?: NativeIds })[kNativeIds];

export type CanonicalIdsOptions = {
  /**
   * Canonical -> provider-native IDs that win over the catalog. Values may use `{key}`
   * placeholders from `options.template`.
   */
  mapping?: Partial<Record<ModelId, string>>;
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
 * `provider` also accepts the previous (`v3`) specification because some
 * community providers still target it (voyage, zhipu). The returned provider is
 * always `v4`: `customProvider` normalizes the fallback for us.
 */
export const withCanonicalIds = (
  provider: ProviderV3 | ProviderV4,
  config: CanonicalIdsOptions = {},
) => {
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

  const ids: NativeIds = new Map();

  // Explicit mapping, then the catalog, then the fallback transform.
  const resolve = (id: string) => {
    const native = mapping?.[id] ?? ids.get(id);
    const mapped =
      native === undefined ? applyFallbackAffixes(normalizeId(id)) : applyTemplate(native);
    if (mapped !== id) logger.debug(`[canonical] mapped ${id} to ${mapped}`);
    return mapped;
  };

  const languageModel: (id: string) => LanguageModel = (id) => provider.languageModel(id);
  const embeddingModel: (id: string) => EmbeddingModel = (id) => provider.embeddingModel(id);
  // Optional in the provider spec: only wrapped when the provider supports transcription.
  const transcriptionModel: ((id: string) => TranscriptionModel) | undefined =
    provider.transcriptionModel && ((id) => provider.transcriptionModel!(id));

  const wrapped = customProvider({
    fallbackProvider: {
      ...provider,
      // Community providers may omit `specificationVersion`. Anything that is
      // not explicitly `v4` must report `v3`, otherwise the AI SDK adapts it
      // through its v2 shim, which reads the deprecated `textEmbeddingModel`
      // and would bypass the overrides below.
      specificationVersion: provider.specificationVersion === "v4" ? "v4" : "v3",
      languageModel: (id: string) => languageModel(resolve(id)),
      embeddingModel: (id: string) => embeddingModel(resolve(id)),
      ...(transcriptionModel && {
        transcriptionModel: (id: string) => transcriptionModel(resolve(id)),
      }),
    } as ProviderV3 | ProviderV4,
  });

  return withNativeIds(wrapped, ids);
};
