import type { ZhipuProvider } from "zhipu-ai-provider";

import type { ModelId } from "../../models/types.ts";
import { withCanonicalIds } from "../registry.ts";

export const withCanonicalIdsForZai = (
  provider: ZhipuProvider,
  extraMapping?: Partial<Record<ModelId, string>>,
) =>
  withCanonicalIds(provider, {
    providerId: "zai",
    mapping: extraMapping,
    options: { stripNamespace: true },
  });
