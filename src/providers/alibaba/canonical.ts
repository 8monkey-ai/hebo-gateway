import type { AlibabaProvider } from "@ai-sdk/alibaba";

import type { CanonicalModelId, ModelId } from "../../models/types";
import { withCanonicalIds } from "../registry";

const MAPPING = {
  "alibaba/qwen3-235b": "qwen3-235b-a22b",
  "alibaba/qwen3-30b": "qwen3-30b-a3b",
  "alibaba/qwen3-235b-a22b-thinking": "qwen3-235b-a22b-thinking-2507",
  "alibaba/qwen3.5-397b": "qwen3.5-397b-a17b",
  "alibaba/qwen3-coder": "qwen-coder",
  "alibaba/qwen3-coder-480b": "qwen3-coder-480b-a35b-instruct",
  "alibaba/qwen3-coder-30b": "qwen3-coder-30b-a3b-instruct",
  "alibaba/qwen3-vl-235b": "qwen3-vl-235b-a22b",
} as const satisfies Partial<Record<CanonicalModelId, string>>;

export const withCanonicalIdsForAlibaba = (
  provider: AlibabaProvider,
  extraMapping?: Record<ModelId, string>,
) =>
  withCanonicalIds(provider, {
    mapping: { ...MAPPING, ...extraMapping },
  });
