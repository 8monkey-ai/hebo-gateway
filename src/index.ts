export * from "./gateway.ts";
export type * from "./types.ts";

export * from "./errors/anthropic.ts";
export * from "./errors/gateway.ts";
export * from "./errors/openai.ts";
export * from "./logger/index.ts";

export * from "./middleware/common.ts";
export * from "./middleware/matcher.ts";
export * from "./middleware/reasoning.ts";
export * from "./middleware/transcription.ts";

// Lab and catalog plumbing (lab registration, the models.dev converter, spec stores) stays
// internal: lab modules and provider adapters import it directly.
export {
  defineModelCatalog,
  type ModelCatalogInput,
  type ModelCatalogSourceConfig,
  type ModelCatalogSpec,
  type ModelGroup,
  type ModelLab,
  type ModelOverride,
  type ModelSelection,
} from "./models/catalog.ts";
export * from "./models/family.ts";
export type * from "./models/types.ts";

export {
  type CanonicalIdsOptions,
  type CanonicalIdsProvider,
  type NativeModelSpec,
  resolveProvider,
  specOf,
  withCanonicalIds,
} from "./providers/registry.ts";
export * from "./providers/types.ts";

export { FORWARD_HEADER_ALLOWLIST, RESPONSE_HEADER_ALLOWLIST } from "./utils/index.ts";
