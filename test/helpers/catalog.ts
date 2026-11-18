import type { ProviderV4 } from "@ai-sdk/provider";

// oxlint-disable no-unassigned-import
import "../../src/models/alibaba/index.ts";
import "../../src/models/amazon/index.ts";
import "../../src/models/anthropic/index.ts";
import "../../src/models/cohere/index.ts";
import "../../src/models/deepseek/index.ts";
import "../../src/models/google/index.ts";
import "../../src/models/meta/index.ts";
import "../../src/models/microsoft/index.ts";
import "../../src/models/minimax/index.ts";
import "../../src/models/moonshot/index.ts";
import "../../src/models/openai/index.ts";
import "../../src/models/voyage/index.ts";
import "../../src/models/xai/index.ts";
import "../../src/models/zai/index.ts";
// oxlint-enable no-unassigned-import
import { createModelCatalog } from "../../src/models/catalog.ts";
import type { ModelCatalog } from "../../src/models/types.ts";

/**
 * Loads the bundled models.dev snapshots of every lab for `provider`, registered as `id`,
 * which hands it the native IDs like a gateway does. Returns the models it serves.
 */
export const loadBundledCatalog = (id: string, provider: ProviderV4): ModelCatalog =>
  createModelCatalog(undefined, { [id]: provider }, { source: false }).current!;
