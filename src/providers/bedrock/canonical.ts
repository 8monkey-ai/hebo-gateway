import { type AmazonBedrockProvider } from "@ai-sdk/amazon-bedrock";

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
  "anthropic/claude-haiku-4.5": "{ip}anthropic.claude-haiku-4-5-20251001-v1:0",
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
  "openai/gpt-oss-20b": "openai.gpt-oss-20b-1:0",
  "openai/gpt-oss-120b": "openai.gpt-oss-120b-1:0",
} as const satisfies Partial<Record<CanonicalModelId, string>>;

export type BedrockInferenceProfileOptions = {
  /** @default "preferred" */
  mode?: "preferred" | "avoid";
  /** @default "us" */
  // eslint-disable-next-line ban-types
  geo?: "global" | "us" | "eu" | "apac" | "au" | "ca" | "jp" | "us-gov" | (string & {});
  arn?: { region: string; accountId: string };
};

const resolveInferenceProfile = ({ geo = "us", arn }: BedrockInferenceProfileOptions = {}) =>
  `${arn ? `arn:aws:bedrock:${arn.region}:${arn.accountId}:inference-profile/` : ""}${geo}.`;

export type BedrockCanonicalConfig = {
  inferenceProfile?: BedrockInferenceProfileOptions;
  extraMapping?: Record<ModelId, string>;
};

export const withCanonicalIdsForBedrock = (
  provider: AmazonBedrockProvider,
  config: BedrockCanonicalConfig = {},
) =>
  withCanonicalIds(provider, {
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
