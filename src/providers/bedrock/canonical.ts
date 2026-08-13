import {
  type AmazonBedrockProvider,
  type AmazonBedrockProviderSettings,
  createAmazonBedrock,
} from "@ai-sdk/amazon-bedrock";
import {
  type BedrockMantleProvider,
  type BedrockMantleProviderSettings,
  createBedrockMantle,
} from "@ai-sdk/amazon-bedrock/mantle";
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
  "anthropic/claude-opus-5": "{ip}anthropic.claude-opus-5",
  "anthropic/claude-sonnet-5": "{ip}anthropic.claude-sonnet-5",
  "anthropic/claude-haiku-4.5": "{ip}anthropic.claude-haiku-4-5-20251001-v1:0",
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
} as const satisfies Partial<Record<CanonicalModelId, string>>;

/**
 * `createAmazonBedrock` keeps `region` and its credentials in a closure, so the resolved
 * base URL is only reachable through the config the AI SDK attaches to a model instance.
 */
type BedrockModelConfig = {
  baseUrl: () => string;
  headers: () => Record<string, string | undefined>;
};

/** `https://bedrock-runtime.us-east-1.amazonaws.com` -> `us-east-1` */
const REGION_FROM_BASE_URL = /^https?:\/\/[^./]+\.([^./]+)\./u;

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
    region = REGION_FROM_BASE_URL.exec(config.baseUrl())?.[1];
    headers = config.headers();
  } catch {
    // Region is unresolvable (neither `region` nor `AWS_REGION` is set). Let Mantle load
    // its own settings so the error surfaces from there instead.
    logger.debug("[canonical] could not resolve the bedrock region for mantle");
  }

  // Credentials are not readable back off a provider instance: they never leave the
  // `createAmazonBedrock` closure, and its SigV4 fetch signs for the `bedrock` service while
  // Mantle requires `bedrock-mantle`. Pass settings instead of an instance to share them.
  return createBedrockMantle({
    ...settings,
    region: settings.region ?? region,
    headers: settings.headers ?? headers,
  });
};

/**
 * Converse-only settings: `baseURL` addresses `bedrock-runtime` and `generateId` has no
 * Mantle counterpart. Region, credentials, headers and `fetch` apply to both endpoints
 * unchanged, so one settings object configures both.
 */
const toMantleSettings = ({
  baseURL: _baseURL,
  generateId: _generateId,
  ...shared
}: AmazonBedrockProviderSettings): BedrockMantleProviderSettings => shared;

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
   * Mantle-only overrides, for the rare case where the two endpoints must differ (a separate
   * `baseURL`, region, or credentials). Everything the Mantle provider needs already comes
   * from the settings passed to `withCanonicalIdsForBedrock`, so this is normally unused.
   */
  mantle?: BedrockMantleProviderSettings;
};

/**
 * Prefer passing `AmazonBedrockProviderSettings` over a provider instance: GPT-5.x is served
 * only by Bedrock's Mantle endpoint, and settings are the one thing both endpoints can share
 * — credentials cannot be read back off an instance, so `createAmazonBedrock(...)` forces
 * Mantle to source its own (ambient AWS environment, or `config.mantle`).
 */
export const withCanonicalIdsForBedrock = (
  provider: AmazonBedrockProvider | AmazonBedrockProviderSettings,
  config: BedrockCanonicalConfig = {},
) => {
  const bedrock = typeof provider === "function" ? provider : createAmazonBedrock(provider);
  const mantleSettings: BedrockMantleProviderSettings = {
    ...(typeof provider === "function" ? undefined : toMantleSettings(provider)),
    ...config.mantle,
  };

  const base = withCanonicalIds(bedrock, {
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
  const mantleModel = (canonicalId: string, mantleId: string) => {
    logger.debug(`[canonical] mapped ${canonicalId} to ${mantleId} (mantle)`);
    mantle ??= resolveMantle(bedrock, mantleSettings);
    // These models expect the Responses API; Chat Completions is the Mantle default.
    return mantle.responses(mantleId);
  };

  const languageModels = {} as Record<string, LanguageModel>;
  for (const [canonicalId, mantleId] of Object.entries(MANTLE_MAPPING)) {
    // Lazy, so the nested provider is only created once one of its models is requested.
    Object.defineProperty(languageModels, canonicalId, {
      get: () => mantleModel(canonicalId, mantleId),
    });
  }

  return customProvider({ languageModels, fallbackProvider: base });
};
