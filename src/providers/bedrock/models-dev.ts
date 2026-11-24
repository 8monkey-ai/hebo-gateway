import { logger } from "../../logger/index.ts";
import type { ModelsDevHost, ModelsDevListing, ModelsDevPick } from "../../models/models-dev.ts";

declare module "../../models/types.ts" {
  interface ModelSpec {
    /**
     * Bedrock: served through a cross-region inference profile, `required` (only) or
     * `optional` (on demand too). The configured profile prefixes `id`.
     */
    profile?: "required" | "optional";
    /** Bedrock: served by the OpenAI-compatible Mantle endpoint. */
    route?: "mantle";
  }
}

const MANTLE = "@ai-sdk/amazon-bedrock/mantle";

/** Cross-region inference profile prefixes. `us-gov` is opt-in only. */
const GEO = /^(global|us|eu|apac|au|ca|jp|in|us-gov)\./u;

/** An ID still carrying a profile-like prefix once a known one is stripped. */
const PROFILE_LIKE = /^[a-z]+(?:-[a-z]+)*\.[a-z]+\./u;

/** An ARN or an unknown inference profile prefix would bypass the configured profile. */
const isSafe = (id: string, nativeId: string) => {
  const bare = nativeId.replace(GEO, "");
  if (!bare.startsWith("arn:") && !PROFILE_LIKE.test(bare)) return true;
  logger.warn(`[models] ${id} not served on bedrock: invalid native ID`);
  return false;
};

type Candidate = ModelsDevListing & {
  converse?: boolean;
  mantle?: boolean;
  geo?: boolean;
  rank: number;
};

/** Metadata comes from the plain listing, then a profile, then GovCloud (own limits). */
const rankOf = (geo: string | undefined) => (geo === undefined ? 0 : geo === "us-gov" ? 2 : 1);

const picked = ({ nativeId, model }: Candidate, spec: ModelsDevPick["spec"]): ModelsDevPick => ({
  nativeId,
  model,
  spec,
});

/**
 * Bedrock lists a model once per inference profile (`us.`, `global.`, …) and sometimes
 * once more on Mantle. Prefers Converse, collapsing the profiles into a `required` profile,
 * or an `optional` one when the bare ID is listed too, then Mantle. Regional and GovCloud
 * listings can carry their own limits, so metadata comes from the plain listing first.
 */
const pick = (id: string, listings: readonly ModelsDevListing[]): ModelsDevPick | undefined => {
  const bare = new Map<string, Candidate>();
  for (const { nativeId, model } of listings) {
    if (!isSafe(id, nativeId)) continue;
    const geo = GEO.exec(nativeId)?.[1];
    const bareId = geo ? nativeId.slice(geo.length + 1) : nativeId;
    const rank = rankOf(geo);
    let flags = bare.get(bareId);
    if (!flags) bare.set(bareId, (flags = { nativeId: bareId, model, rank }));
    else if (rank < flags.rank) {
      flags.model = model;
      flags.rank = rank;
    }
    if (geo) flags.geo = flags.geo === true || geo !== "us-gov";
    else if (model.provider?.npm === MANTLE) flags.mantle = true;
    else flags.converse = true;
  }

  const candidates = [...bare.values()];
  candidates.sort((a, b) => a.nativeId.length - b.nativeId.length);

  const converse = candidates.find((c) => c.converse);
  if (converse) return picked(converse, converse.geo ? { profile: "optional" } : undefined);

  const mantle = candidates.find((c) => c.mantle);
  if (mantle) return picked(mantle, { route: "mantle" });

  const profile = candidates.find((c) => c.geo);
  return profile && picked(profile, { profile: "required" });
};

/** How the Bedrock adapter reads models.dev's `amazon-bedrock` provider. */
export const BEDROCK_MODELS_DEV_HOST: ModelsDevHost = { sdks: [MANTLE], pick };
