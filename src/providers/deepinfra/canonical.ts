import { type DeepInfraProvider } from "@ai-sdk/deepinfra";

import type { CanonicalModelId, ModelId } from "../../models/types";
import { withCanonicalIds } from "../registry";

const MAPPING = {
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
