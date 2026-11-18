import type { AlibabaProvider } from "@ai-sdk/alibaba";

import type { ModelId } from "../../models/types.ts";
import { withCanonicalIds } from "../registry.ts";

export const withCanonicalIdsForAlibaba = (
  provider: AlibabaProvider,
  extraMapping?: Partial<Record<ModelId, string>>,
) =>
  withCanonicalIds(provider, {
    mapping: extraMapping,
  });
