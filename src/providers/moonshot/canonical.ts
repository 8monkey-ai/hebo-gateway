import { type MoonshotAIProvider } from "@ai-sdk/moonshotai";

import type { ModelId } from "../../models/types";
import { withCanonicalIds } from "../registry";

export const withCanonicalIdsForMoonshot = (
  provider: MoonshotAIProvider,
  extraMapping?: Partial<Record<ModelId, string>>,
) =>
  withCanonicalIds(provider, {
    mapping: extraMapping,
    options: { stripNamespace: true },
  });
