import { type AmazonBedrockProvider } from "@ai-sdk/amazon-bedrock";
import {
  type AmazonBedrockAnthropicProvider,
  type AmazonBedrockAnthropicProviderSettings,
  createAmazonBedrockAnthropic,
} from "@ai-sdk/amazon-bedrock/anthropic";
import {
  type BedrockMantleProvider,
  type BedrockMantleProviderSettings,
  createBedrockMantle,
} from "@ai-sdk/amazon-bedrock/mantle";
import type { LanguageModelV4, ProviderV4 } from "@ai-sdk/provider";
import { customProvider, type LanguageModel } from "ai";

import { logger } from "../../logger";
import type { CanonicalModelId, ModelId } from "../../models/types";
import { withCanonicalIds } from "../registry";

// For a list of all models with their IDs and InferenceTypes check:
//   https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html
// OR
//   aws bedrock list-foundation-models --region us-east-1 \
//     --query "modelSummaries[].{id:modelId,mode:join(',', inferenceTypesSupported)}" \
//     --output table
const MAPPING = {
  // Require Inference Profiles and can't be resolved from standard name mapping
  "anthropic/claude-opus-5.5": "{ip}anthropic.claude-opus-5-5",
  "anthropic/claude-opus-5": "{ip}anthropic.claude-opus-5",
  "anthropic/claude-sonnet-5": "{ip}anthropic.claude-sonnet-5",
  "anthropic/claude-haiku-4.5": "{ip}anthropic.claude-haiku-4-5-20251001-v1:0",
  "anthropic/claude-fable-5.1": "{ip}anthropic.claude-fable-5-1",
  "anthropic/claude-fable-5": "{ip}anthropic.claude-fable-5",
  "anthropic/claude-opus-4.8": "{ip}anthropic.claude-opus-4-8",
  "anthropic/claude-opus-4.7": "{ip}anthropic.claude-opus-4-7",
  "anthropic/claude-sonnet-4.6": "{ip}anthropic.claude-sonnet-4-6",
  "anthropic/claude-sonnet-4.5": "{ip}anthropic.claude-sonnet-4-5-20250929-v1:0",
  "anthropic/claude-opus-4.6": "{ip}anthropic.claude-opus-4-6-v1",
  "anthropic/claude-opus-4.5": "{ip}anthropic.claude-opus-4-5-20251101-v1:0",
  "anthropic/claude-opus-4.1": "{ip}anthropic.claude-opus-4-1-20250805-v1:0",
  "anthropic/claude-sonnet-4": "{ip}anthropic.claude-sonnet-4-20250514-v1:0",
  "anthropic/claude-opus-4": "{ip}anthropic.claude-opus-4-20250514-v1:0",
  "anthropic/claude-sonnet-3.7": "{ip}anthropic.claude-3-7-sonnet-20250219-v1:0",
  "anthropic/claude-sonnet-3.5": "{ip}anthropic.claude-3-5-sonnet-20241022-v2:0",
  "anthropic/claude-haiku-3.5": "{ip}anthropic.claude-3-5-haiku-20241022-v1:0",
  "anthropic/claude-haiku-3": "{ip}anthropic.claude-3-haiku-20240307-v1:0",
  "cohere/embed-v4.0": "{ip}cohere.embed-v4:0",
  "meta/llama-3.1-70b": "{ip}meta.llama3-1-70b-instruct-v1:0",
  "meta/llama-3.1-405b": "{ip}meta.llama3-1-405b-instruct-v1:0",
  "meta/llama-3.2-1b": "{ip}meta.llama3-2-1b-instruct-v1:0",
  "meta/llama-3.2-3b": "{ip}meta.llama3-2-3b-instruct-v1:0",
  "meta/llama-3.2-11b": "{ip}meta.llama3-2-11b-instruct-v1:0",
  "meta/llama-3.2-90b": "{ip}meta.llama3-2-90b-instruct-v1:0",
  "meta/llama-4-scout": "{ip}meta.llama4-scout-17b-instruct-v1:0",
  "meta/llama-4-maverick": "{ip}meta.llama4-maverick-17b-instruct-v1:0",
  // On-demand only models, ensure that {ip} is never added
  "amazon/nova-2-multimodal-embeddings": "amazon.nova-2-multimodal-embeddings-v1:0",
  "cohere/embed-english-v3.0": "cohere.embed-english-v3",
  "cohere/embed-multilingual-v3.0": "cohere.embed-multilingual-v3",
  "cohere/command-r": "cohere.command-r-v1:0",
  "cohere/command-r-plus": "cohere.command-r-plus-v1:0",
  "meta/llama-3.3-70b": "meta.llama3-3-70b-instruct-v1:0",
  "meta/llama-3.1-8b": "meta.llama3-1-8b-instruct-v1:0",
  "google/gemma-3-4b": "google.gemma-3-4b-it",
  "google/gemma-3-12b": "google.gemma-3-12b-it",
  "google/gemma-3-27b": "google.gemma-3-27b-it",
  "openai/gpt-oss-20b": "openai.gpt-oss-20b-1:0",
  "openai/gpt-oss-120b": "openai.gpt-oss-120b-1:0",
  "alibaba/qwen3-235b": "qwen.qwen3-235b-a22b-2507-v1:0",
  "alibaba/qwen3-32b": "qwen.qwen3-32b-v1:0",
  "alibaba/qwen3-vl-235b": "qwen.qwen3-vl-235b-a22b",
} as const satisfies Partial<Record<CanonicalModelId, string>>;

// Served only from the OpenAI-compatible Mantle endpoint, never from Converse/Invoke on
// `bedrock-runtime`. Their IDs keep the dotted version, take no inference profile prefix
// and no `-v1:0` postfix, so they bypass the mapping above entirely.
//   https://docs.aws.amazon.com/bedrock/latest/userguide/inference-mantle.html
const MANTLE_MAPPING = {
  "openai/gpt-5.5": "openai.gpt-5.5",
  "openai/gpt-5.6-sol": "openai.gpt-5.6-sol",
  "openai/gpt-5.6-terra": "openai.gpt-5.6-terra",
  "openai/gpt-5.6-luna": "openai.gpt-5.6-luna",
  "openai/gpt-6-astra": "openai.gpt-6-astra",
  "openai/gpt-6-sol": "openai.gpt-6-sol",
  "openai/gpt-6-luna": "openai.gpt-6-luna",
} as const satisfies Partial<Record<CanonicalModelId, string>>;

/**
 * `createAmazonBedrock` keeps `region` and its credentials in a closure, so the resolved
 * base URL is only reachable through the config the AI SDK attaches to a model instance.
 */
type BedrockModelConfig = {
  baseUrl: () => string;
  headers: () => Record<string, string | undefined>;
  fetch?: AmazonBedrockAnthropicProviderSettings["fetch"];
};

/** `https://bedrock-runtime.us-east-1.amazonaws.com` -> `us-east-1` */
const REGION_FROM_BASE_URL = /^https?:\/\/[^./]+\.([^./]+)\./u;

/** A custom base URL need not carry a region in that label: `us-east-1`, `us-gov-west-1` */
const AWS_REGION = /^[a-z]{2}(?:-[a-z]+)+-\d+$/u;

const resolveMantle = (
  provider: AmazonBedrockProvider,
  settings: BedrockMantleProviderSettings = {},
): BedrockMantleProvider => {
  // Any model id works: constructing a model issues no request, it only resolves settings.
  const { config } = provider.languageModel("amazon.nova-lite-v1:0") as unknown as {
    config: BedrockModelConfig;
  };

  let region: string | undefined;
  let headers: Record<string, string | undefined> | undefined;
  try {
    // Headers first: they resolve unconditionally, while the base URL throws on a missing
    // region, and losing the region is no reason to drop the inherited headers too.
    headers = config.headers();
    const parsed = REGION_FROM_BASE_URL.exec(config.baseUrl())?.[1];
    // A custom base URL can hold anything in that label, and a wrong region would only
    // surface as a DNS failure. Keep it only when it looks like a region.
    region = parsed && AWS_REGION.test(parsed) ? parsed : undefined;
  } catch {
    // Region is unresolvable (neither `region` nor `AWS_REGION` is set). Let Mantle load
    // its own settings so the error surfaces from there instead.
    logger.debug("[canonical] could not resolve the bedrock region for mantle");
  }

  // Credentials are not readable back off a provider instance: they never leave the
  // `createAmazonBedrock` closure, and its SigV4 fetch cannot be borrowed either because it
  // signs for the `bedrock` service while Mantle requires `bedrock-mantle`. Mantle therefore
  // loads its own, exactly like the Vertex adapter falls back to ambient credentials in
  // express mode: `AWS_BEARER_TOKEN_BEDROCK` / `AWS_ACCESS_KEY_ID` cover both endpoints, and
  // `config.mantle` is the explicit override.
  return createBedrockMantle({
    ...settings,
    region: settings.region ?? region,
    headers: settings.headers ?? headers,
  });
};

/** Canonical IDs under this namespace are served by the nested Anthropic provider. */
const ANTHROPIC_NAMESPACE = "anthropic/";

/** Settings that make the nested provider authenticate itself instead of inheriting. */
const OWN_AUTH_SETTINGS = [
  "apiKey",
  "accessKeyId",
  "secretAccessKey",
  "sessionToken",
  "credentialProvider",
  "fetch",
] as const satisfies readonly (keyof AmazonBedrockAnthropicProviderSettings)[];

/**
 * Placeholder that keeps the nested provider off its own credential resolution. The
 * inherited fetch applies the wrapped provider's auth, and this header never gets sent.
 */
const INHERITED_AUTH = "inherited";

type BedrockFetch = NonNullable<AmazonBedrockAnthropicProviderSettings["fetch"]>;

const withoutAuthorization = (headers: HeadersInit): Record<string, string> => {
  const entries: Iterable<[string, string]> =
    headers instanceof Headers || Array.isArray(headers) ? headers : Object.entries(headers);

  const out: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (value === undefined || key.toLowerCase() === "authorization") continue;
    out[key] = value;
  }
  return out;
};

// Converse cannot express the Anthropic request shape: no mid-conversation `system` turns
// (which Claude Code sends), no `anthropic_beta`, no native `cache_control`. InvokeModel
// takes the Anthropic body verbatim, so Claude is served from there instead.
//   https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages.html
const resolveAnthropic = (
  provider: AmazonBedrockProvider,
  settings: AmazonBedrockAnthropicProviderSettings = {},
): AmazonBedrockAnthropicProvider => {
  // Any model id works: constructing a model issues no request, it only resolves settings.
  const { config } = provider.languageModel("amazon.nova-lite-v1:0") as unknown as {
    config: BedrockModelConfig;
  };

  let baseURL: string | undefined;
  let headers: Record<string, string | undefined> | undefined;
  try {
    // Headers first: they resolve unconditionally, while the base URL throws on a missing
    // region, and losing that is no reason to drop the inherited headers too.
    headers = config.headers();
    // InvokeModel lives on the same `bedrock-runtime` host as Converse, custom base URL
    // included, so the resolved one carries over as is.
    baseURL = config.baseUrl();
  } catch {
    // Region is unresolvable (neither `region` nor `AWS_REGION` is set). Let the nested
    // provider resolve its own base URL so the error surfaces from there instead.
    logger.debug("[canonical] could not resolve the bedrock base url for anthropic");
  }

  const inherited = {
    ...settings,
    // An explicit nested `region` resolves its own host, so the inherited one cannot win.
    baseURL: settings.baseURL ?? (settings.region ? undefined : baseURL),
    headers: settings.headers ?? headers,
  };

  // Explicit credentials win: the nested provider then signs for itself.
  if (OWN_AUTH_SETTINGS.some((key) => settings[key] !== undefined)) {
    return createAmazonBedrockAnthropic(inherited);
  }

  // Unlike Mantle, InvokeModel signs for the same `bedrock` service as Converse, so the
  // wrapped provider's fetch signs these requests too — credentials (including a
  // `credentialProvider`) are inherited instead of having to be configured twice.
  const baseFetch: BedrockFetch = config.fetch ?? globalThis.fetch;
  // The cast only drops the runtime-specific extras of `typeof globalThis.fetch`
  // (`preconnect` on Bun), which a request-signing wrapper has no use for.
  const inheritedFetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    baseFetch(
      input,
      init?.headers ? { ...init, headers: withoutAuthorization(init.headers) } : init,
    )) as BedrockFetch;

  return createAmazonBedrockAnthropic({
    ...inherited,
    apiKey: INHERITED_AUTH,
    fetch: inheritedFetch,
  });
};

export type BedrockInferenceProfileOptions = {
  /** @default "preferred" */
  mode?: "preferred" | "avoid";
  /** @default "us" */
  // oxlint-disable-next-line ban-types
  geo?: "global" | "us" | "eu" | "apac" | "au" | "ca" | "jp" | "us-gov" | (string & {});
  arn?: { region: string; accountId: string };
};

const resolveInferenceProfile = ({ geo = "us", arn }: BedrockInferenceProfileOptions = {}) =>
  `${arn ? `arn:aws:bedrock:${arn.region}:${arn.accountId}:inference-profile/` : ""}${geo}.`;

export type BedrockCanonicalConfig = {
  inferenceProfile?: BedrockInferenceProfileOptions;
  extraMapping?: Record<ModelId, string>;
  /**
   * Settings for the nested Mantle provider, which serves the GPT-5.x models. `region` and
   * custom headers are inherited from the wrapped provider; credentials are not, so set them
   * here unless the ambient AWS environment already carries them.
   */
  mantle?: BedrockMantleProviderSettings;
  /**
   * Settings for the nested Anthropic provider, which serves the Claude models through
   * `InvokeModel` instead of Converse. The base URL, custom headers and credentials of the
   * wrapped provider are inherited; set them here to override. Pass `false` to keep Claude
   * on Converse, at the cost of the Anthropic-native request shape.
   */
  anthropic?: AmazonBedrockAnthropicProviderSettings | false;
};

export const withCanonicalIdsForBedrock = (
  provider: AmazonBedrockProvider,
  config: BedrockCanonicalConfig = {},
) => {
  const base = withCanonicalIds(provider, {
    mapping: {
      ...MAPPING,
      ...config.extraMapping,
    },
    options: {
      stripNamespace: false,
      namespaceSeparator: ".",
      normalizeDelimiters: true,
      prefix:
        config.inferenceProfile?.mode === "avoid"
          ? ""
          : resolveInferenceProfile(config.inferenceProfile),
      template: {
        ip: resolveInferenceProfile(config.inferenceProfile),
      },
      postfix: config.inferenceProfile?.mode === "avoid" ? "" : "-v1:0",
    },
  });

  // Deferred so incomplete settings surface at model construction, not at wrap time.
  let mantle: BedrockMantleProvider | undefined;
  const models = new Map<string, LanguageModel>();
  const mantleModel = (canonicalId: string, mantleId: string) => {
    let model = models.get(canonicalId);
    if (model) return model;

    logger.debug(`[canonical] mapped ${canonicalId} to ${mantleId} (mantle)`);
    mantle ??= resolveMantle(provider, config.mantle);
    // These models expect the Responses API; Chat Completions is the Mantle default.
    model = mantle.responses(mantleId);
    models.set(canonicalId, model);
    return model;
  };

  const languageModels = {} as Record<string, LanguageModel>;
  for (const [canonicalId, mantleId] of Object.entries(MANTLE_MAPPING)) {
    // Lazy, so the nested provider is only created once one of its models is requested.
    Object.defineProperty(languageModels, canonicalId, {
      enumerable: true,
      get: () => mantleModel(canonicalId, mantleId),
    });
  }

  // Claude is open-ended (every `anthropic/*` ID, mapped or not), so it is routed on lookup
  // rather than enumerated like the Mantle models above.
  const anthropicSettings = config.anthropic === false ? undefined : config.anthropic;
  let anthropic: AmazonBedrockAnthropicProvider | undefined;
  const anthropicModels = new Map<string, LanguageModelV4>();
  const anthropicModel = (canonicalId: string) => {
    let model = anthropicModels.get(canonicalId);
    if (model) return model;

    // The Converse model resolves the canonical ID without issuing a request, and InvokeModel
    // takes the exact same IDs, inference profiles included.
    const bedrockId = base.languageModel(canonicalId).modelId;
    logger.debug(`[canonical] mapped ${canonicalId} to ${bedrockId} (invoke)`);
    anthropic ??= resolveAnthropic(provider, anthropicSettings);
    model = anthropic.languageModel(bedrockId);
    anthropicModels.set(canonicalId, model);
    return model;
  };

  const fallbackProvider: ProviderV4 =
    config.anthropic === false
      ? base
      : {
          ...base,
          languageModel: (id) =>
            id.startsWith(ANTHROPIC_NAMESPACE) ? anthropicModel(id) : base.languageModel(id),
        };

  return customProvider({ languageModels, fallbackProvider });
};
