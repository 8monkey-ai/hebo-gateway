import { expect, test } from "bun:test";

import { modelMiddlewareMatcher } from "../../middleware/matcher.ts";
import { voyageDimensionsMiddleware } from "./middleware.ts";

test("voyageDimensionsMiddleware > matching patterns", () => {
  const matching = ["voyageai/voyage-4-lite", "voyageai/voyage-4", "voyageai/voyage-4-large"];

  const nonMatching = ["openai/text-embedding-3-small", "cohere/embed-v4.0"];

  for (const id of matching) {
    const middleware = modelMiddlewareMatcher.resolve({ kind: "embedding", modelId: id });
    expect(middleware).toContain(voyageDimensionsMiddleware);
  }

  for (const id of nonMatching) {
    const middleware = modelMiddlewareMatcher.resolve({ kind: "embedding", modelId: id });
    expect(middleware).not.toContain(voyageDimensionsMiddleware);
  }
});
