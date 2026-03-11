import { describe, expect, test } from "bun:test";

import { convertToEmbedCallOptions } from "./converters";

describe("Embeddings Converters", () => {
  test("should map metadata into providerOptions.unknown", () => {
    const result = convertToEmbedCallOptions({
      input: "hello world",
      metadata: {
        tenant: "acme",
        "Org ID": "o-123",
      },
    });

    expect(result.providerOptions).toEqual({
      unknown: {
        metadata: {
          tenant: "acme",
          "Org ID": "o-123",
        },
      },
    });
  });
});
