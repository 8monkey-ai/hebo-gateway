import { expect, test } from "bun:test";

import { modelMiddlewareMatcher } from "../../middleware/matcher";
import { CANONICAL_MODEL_IDS } from "../../models/types";
import { voyageDimensionsMiddleware } from "./middleware";

test("voyageDimensionsMiddleware > matching patterns", () => {
  const matching = [
    "voyage/voyage-2-code",
    "voyage/voyage-3.5",
    "voyage/voyage-4",
  ] satisfies (typeof CANONICAL_MODEL_IDS)[number][];

  const nonMatching = [
    "openai/text-embedding-3-small",
    "cohere/embed-v4.0",
  ] satisfies (typeof CANONICAL_MODEL_IDS)[number][];

  for (const id of matching) {
    const middleware = modelMiddlewareMatcher.forEmbeddingModel(id);
    expect(middleware).toContain(voyageDimensionsMiddleware);
  }

  for (const id of nonMatching) {
    const middleware = modelMiddlewareMatcher.forEmbeddingModel(id);
    expect(middleware).not.toContain(voyageDimensionsMiddleware);
  }
});
