import type { ZhipuProvider } from "zhipu-ai-provider";

import type { CanonicalModelId, ModelId } from "../../models/types";
import { withCanonicalIds } from "../registry";

const MAPPING = {
  "zhipu/glm-5": "glm-5-20260211",
  "zhipu/glm-5-turbo": "glm-5-turbo-20260315",
  "zhipu/glm-5.1": "glm-5.1-20260406",
} as const satisfies Partial<Record<CanonicalModelId, string>>;

export const withCanonicalIdsForZai = (
  provider: ZhipuProvider,
  extraMapping?: Partial<Record<ModelId, string>>,
) =>
  withCanonicalIds(provider, {
    mapping: { ...MAPPING, ...extraMapping },
    options: { stripNamespace: true },
  });
