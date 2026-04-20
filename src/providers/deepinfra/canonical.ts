import { type DeepInfraProvider } from "@ai-sdk/deepinfra";

import type { CanonicalModelId, ModelId } from "../../models/types";
import { withCanonicalIds } from "../registry";

const MAPPING = {
  "meta/llama-3.1-8b": "meta-llama/Meta-Llama-3.1-8B-Instruct",
  "meta/llama-3.1-70b": "meta-llama/Meta-Llama-3.1-70B-Instruct",
  "meta/llama-3.1-405b": "meta-llama/Meta-Llama-3.1-405B-Instruct",
  "meta/llama-3.2-11b": "meta-llama/Llama-3.2-11B-Vision-Instruct",
  "meta/llama-3.2-90b": "meta-llama/Llama-3.2-90B-Vision-Instruct",
  "meta/llama-3.3-70b": "meta-llama/Llama-3.3-70B-Instruct",
  "meta/llama-4-scout": "meta-llama/Llama-4-Scout-17B-16E-Instruct",
  "meta/llama-4-maverick": "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8",
  "minimax/m2.5": "MiniMax/MiniMax-M2.5",
} as const satisfies Partial<Record<CanonicalModelId, string>>;

export const withCanonicalIdsForDeepInfra = (
  provider: DeepInfraProvider,
  extraMapping?: Record<ModelId, string>,
) =>
  withCanonicalIds(provider, {
    mapping: { ...MAPPING, ...extraMapping },
    options: { stripNamespace: false },
  });
