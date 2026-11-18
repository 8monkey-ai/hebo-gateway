import { expect, test } from "bun:test";

import { createGroq } from "@ai-sdk/groq";

import { withCanonicalIdsForGroq } from "./canonical.ts";

const groq = createGroq({ apiKey: "test-key" });

test("withCanonicalIdsForGroq > maps meta/llama-3.3-70b-instruct via explicit mapping", () => {
  const provider = withCanonicalIdsForGroq(groq);
  expect(provider.languageModel("meta/llama-3.3-70b-instruct").modelId).toBe(
    "llama-3.3-70b-versatile",
  );
});
