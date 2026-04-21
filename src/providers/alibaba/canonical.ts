import type { AlibabaProvider } from "@ai-sdk/alibaba";

import type { CanonicalModelId, ModelId } from "../../models/types";
import { withCanonicalIds } from "../registry";

const MAPPING = {
  "alibaba/qwen3-235b": "qwen3-235b-a22b",
  "alibaba/qwen3.5-397b": "qwen3.5-397b-a17b",
  "alibaba/qwen3.5-122b": "qwen3.5-122b-a10b",
  "alibaba/qwen3.5-35b": "qwen3.5-35b-a3b",
  "alibaba/qwen3.5-0.8b": "qwen3.5-0.8b",
  "alibaba/qwen3.6-flash": "qwen3.6-35b-a3b",
  "alibaba/qwen3-vl-235b": "qwen3-vl-235b-a22b",
} as const satisfies Partial<Record<CanonicalModelId, string>>;

export const withCanonicalIdsForAlibaba = (
  provider: AlibabaProvider,
  extraMapping?: Record<ModelId, string>,
) =>
  withCanonicalIds(provider, {
    mapping: { ...MAPPING, ...extraMapping },
  });
