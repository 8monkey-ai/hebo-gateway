import { describe, expect, test } from "bun:test";

import { getEmbeddingsRequestAttributes } from "./otel";
import type { EmbeddingsBody } from "./schema";

describe("Embeddings OTEL", () => {
  test("should map request metadata into per-key attributes", () => {
    const metadata = {
      tenant: "acme",
      "Org ID": "o-123",
    };

    const inputs: EmbeddingsBody = {
      model: "text-embedding-3-small",
      input: "hello world",
      metadata,
    };

    const attrs = getEmbeddingsRequestAttributes(inputs, "recommended");

    expect(attrs["gen_ai.request.metadata"]).toBeUndefined();
    expect(attrs["gen_ai.request.metadata.tenant"]).toBe("acme");
    expect(attrs["gen_ai.request.metadata.Org ID"]).toBe("o-123");
  });
});
