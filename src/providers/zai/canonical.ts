import type { ZhipuProvider } from "zhipu-ai-provider";

import type { ModelId } from "../../models/types.ts";
import { withCanonicalIds } from "../registry.ts";

const MAPPING = {
  "zhipuai/glm-5": "glm-5-20260211",
  "zhipuai/glm-5-turbo": "glm-5-turbo-20260315",
  "zhipuai/glm-5.1": "glm-5.1-20260406",
  "zhipuai/glm-5.2": "glm-5.2-20260616",
  // GLM-5.3 is served from undated IDs, which the default transform already produces.
} as const satisfies Record<ModelId, string>;

export const withCanonicalIdsForZai = (
  provider: ZhipuProvider,
  extraMapping?: Partial<Record<ModelId, string>>,
) =>
  withCanonicalIds(provider, {
    mapping: { ...MAPPING, ...extraMapping },
    namespaces: ["zhipuai"],
    options: { stripNamespace: true },
  });
