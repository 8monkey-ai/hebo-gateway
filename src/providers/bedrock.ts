import {
  createAmazonBedrock,
  bedrock,
  AmazonBedrockProviderSettings,
} from "@ai-sdk/amazon-bedrock";

import type { CanonicalModelId } from "../models/types";

import { withCanonicalIds } from "./registry";

const MAPPING = {
  "anthropic/claude-haiku-4.5": "anthropic.claude-haiku-4-5-20250929-v1:0",
  "anthropic/claude-sonnet-4.5": "anthropic.claude-sonnet-4-5-20250929-v1:0",
  "anthropic/claude-opus-4.5": "anthropic.claude-opus-4-5-20250929-v1:0",
  "meta/llama-3.1-8b": "meta.llama3-1-8b-instruct-v1:0",
  "meta/llama-3.3-70b": "meta.llama3-3-70b-instruct-v1:0",
  "meta/llama-4-scout": "meta.llama4-scout-17b-instruct-v1:0",
  "meta/llama-4-maverick": "meta.llama4-maverick-17b-instruct-v1:0",
  "cohere/embed-v4.0": "cohere.embed-v4:0",
} as const satisfies Partial<Record<CanonicalModelId, string>>;

export type BedrockCanonicalOptions = {
  // eslint-disable-next-line ban-types
  geo?: "global" | "apac" | "us" | "eu" | "au" | "ca" | "jp" | "us-gov" | (string & {});
  arn?: { region: string; accountId: string };
};

export type BedrockCanonicalSettings = AmazonBedrockProviderSettings & BedrockCanonicalOptions;

const resolvePrefix = ({ geo = "global", arn }: BedrockCanonicalSettings = {}) =>
  `${arn ? `arn:aws:bedrock:${arn.region}:${arn.accountId}:inference-profile/` : ""}${geo}.`;

const mergeMapping = (extra?: Record<string, string>) =>
  ({ ...MAPPING, ...extra }) as Record<string, string>;

export const bedrockWithCanonicalIds = (
  opts?: BedrockCanonicalOptions,
  extraMapping?: Record<string, string>,
) =>
  withCanonicalIds(bedrock, mergeMapping(extraMapping), {
    stripNamespace: false,
    namespaceSeparator: ".",
    replaceDots: true,
    prefix: resolvePrefix(opts),
    postfix: "-v1:0",
  });

export const createAmazonBedrockWithCanonicalIds = (
  { geo, arn, ...bedrockSettings }: BedrockCanonicalSettings,
  extraMapping?: Record<string, string>,
) =>
  withCanonicalIds(createAmazonBedrock(bedrockSettings), mergeMapping(extraMapping), {
    stripNamespace: false,
    namespaceSeparator: ".",
    replaceDots: true,
    prefix: resolvePrefix({ geo, arn }),
    postfix: "-v1:0",
  });
