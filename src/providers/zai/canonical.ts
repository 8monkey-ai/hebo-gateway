import type { ZhipuProvider } from "zhipu-ai-provider";

import type { ModelId } from "../../models/types.ts";
import { withCanonicalIds } from "../registry.ts";

export const withCanonicalIdsForZai = (
  provider: ZhipuProvider,
  extraMapping?: Partial<Record<ModelId, string>>,
) =>
  withCanonicalIds(provider, {
    mapping: extraMapping,
    options: { stripNamespace: true },
  });
