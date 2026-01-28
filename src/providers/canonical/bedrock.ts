import { type AmazonBedrockProvider } from "@ai-sdk/amazon-bedrock";

import type { CanonicalModelId, ModelId } from "../../models/types";

import { withCanonicalIds } from "../registry";

const MAPPING = {
  "anthropic/claude-haiku-4.5": "anthropic.claude-haiku-4-5-20251001-v1:0",
  "anthropic/claude-sonnet-4.5": "anthropic.claude-sonnet-4-5-20250929-v1:0",
  "anthropic/claude-opus-4.5": "anthropic.claude-opus-4-5-20251101-v1:0",
  "anthropic/claude-opus-4.1": "anthropic.claude-opus-4-1-20250805-v1:0",
  "anthropic/claude-sonnet-4": "anthropic.claude-sonnet-4-20250514-v1:0",
  "anthropic/claude-opus-4": "anthropic.claude-opus-4-20250514-v1:0",
  "anthropic/claude-sonnet-3.7": "anthropic.claude-3-7-sonnet-20250219-v1:0",
  "anthropic/claude-sonnet-3.5": "anthropic.claude-3-5-sonnet-20241022-v2:0",
  "anthropic/claude-haiku-3.5": "anthropic.claude-3-5-haiku-20241022-v1:0",
  "anthropic/claude-haiku-3": "anthropic.claude-3-haiku-20240307-v1:0",
  "meta/llama-3.1-8b": "meta.llama3-1-8b-instruct-v1:0",
  "meta/llama-3.1-70b": "meta.llama3-1-70b-instruct-v1:0",
  "meta/llama-3.1-405b": "meta.llama3-1-405b-instruct-v1:0",
  "meta/llama-3.2-1b": "meta.llama3-2-1b-instruct-v1:0",
  "meta/llama-3.2-3b": "meta.llama3-2-3b-instruct-v1:0",
  "meta/llama-3.2-11b": "meta.llama3-2-11b-instruct-v1:0",
  "meta/llama-3.2-90b": "meta.llama3-2-90b-instruct-v1:0",
  "meta/llama-3.3-70b": "meta.llama3-3-70b-instruct-v1:0",
  "meta/llama-4-scout": "meta.llama4-scout-17b-instruct-v1:0",
  "meta/llama-4-maverick": "meta.llama4-maverick-17b-instruct-v1:0",
  "cohere/embed-v4.0": "cohere.embed-v4:0",
} as const satisfies Partial<Record<CanonicalModelId, string>>;

export type BedrockCanonicalOptions = {
  /** @default "us" */
  // eslint-disable-next-line ban-types
  geo?: "global" | "us" | "eu" | "apac" | "au" | "ca" | "jp" | "us-gov" | (string & {});
  arn?: { region: string; accountId: string };
};

const resolvePrefix = ({ geo = "us", arn }: BedrockCanonicalOptions = {}) =>
  `${arn ? `arn:aws:bedrock:${arn.region}:${arn.accountId}:inference-profile/` : ""}${geo}.`;

export const withCanonicalIdsForBedrock = (
  provider: AmazonBedrockProvider,
  opts?: BedrockCanonicalOptions,
  extraMapping?: Record<ModelId, string>,
) =>
  withCanonicalIds(
    provider,
    { ...MAPPING, ...extraMapping },
    {
      stripNamespace: false,
      namespaceSeparator: ".",
      normalizeDelimiters: true,
      prefix: resolvePrefix(opts),
      postfix: "-v1:0",
    },
  );
