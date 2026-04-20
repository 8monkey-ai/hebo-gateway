import type { AlibabaProvider } from "@ai-sdk/alibaba";

import type { CanonicalModelId, ModelId } from "../../models/types";
import { withCanonicalIds } from "../registry";

const MAPPING = {
  "alibaba/qwen3-235b": "qwen3-235b-a22b",
  "alibaba/qwen3-32b": "qwen3-32b",
  "alibaba/qwen3-14b": "qwen3-14b",
  "alibaba/qwen3-8b": "qwen3-8b",
  "alibaba/qwen3-max": "qwen3-max",
  "alibaba/qwen3.5-plus": "qwen3.5-plus",
  "alibaba/qwen3.5-397b": "qwen3.5-397b-a17b",
  "alibaba/qwen3.6-plus": "qwen3.6-plus",
  "alibaba/qwen3.6-flash": "qwen3.6-flash",
  "alibaba/qwen3-coder-plus": "qwen3-coder-plus",
  "alibaba/qwen3-coder-flash": "qwen3-coder-flash",
  "alibaba/qwen3-coder-480b": "qwen3-coder-480b-a35b-instruct",
  "alibaba/qwen3-coder-30b": "qwen3-coder-30b-a3b-instruct",
  "alibaba/qwen3-vl-plus": "qwen3-vl-plus",
  "alibaba/qwen3-vl-235b": "qwen3-vl-235b-a22b",
} as const satisfies Partial<Record<CanonicalModelId, string>>;

export const withCanonicalIdsForAlibaba = (
  provider: AlibabaProvider,
  extraMapping?: Record<ModelId, string>,
) =>
  withCanonicalIds(provider, {
    mapping: { ...MAPPING, ...extraMapping },
    options: {
      stripNamespace: true,
    },
  });
