import { type XaiProvider } from "@ai-sdk/xai";

import type { CanonicalModelId, ModelId } from "../../models/types";
import { withCanonicalIds } from "../registry";

const MAPPING = {
  "xai/grok-4.1-fast": "grok-4-1-fast-non-reasoning",
  "xai/grok-4.2": "grok-4.20-0309-non-reasoning",
  "xai/grok-4.2-reasoning": "grok-4.20-0309-reasoning",
  "xai/grok-4.2-multi-agent": "grok-4.20-multi-agent-0309",
} as const satisfies Partial<Record<CanonicalModelId, string>>;

export const withCanonicalIdsForXai = (
  provider: XaiProvider,
  extraMapping?: Partial<Record<ModelId, string>>,
) =>
  withCanonicalIds(provider, {
    mapping: { ...MAPPING, ...extraMapping },
    options: { stripNamespace: true, normalizeDelimiters: true },
  });
