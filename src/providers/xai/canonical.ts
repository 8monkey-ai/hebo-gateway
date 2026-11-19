import { type XaiProvider } from "@ai-sdk/xai";

import type { ModelId } from "../../models/types.ts";
import { withCanonicalIds } from "../registry.ts";

export const withCanonicalIdsForXai = (
  provider: XaiProvider,
  extraMapping?: Partial<Record<ModelId, string>>,
) =>
  withCanonicalIds(provider, {
    providerId: "xai",
    mapping: extraMapping,
    options: { stripNamespace: true },
  });
