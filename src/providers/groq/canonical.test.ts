import { expect, test } from "bun:test";

import { createGroq } from "@ai-sdk/groq";

import { loadBundledCatalog } from "../../../test/helpers/catalog.ts";
import { withCanonicalIdsForGroq } from "./canonical.ts";

const groq = createGroq({ apiKey: "test-key" });

test("withCanonicalIdsForGroq > maps catalog models to their native IDs", () => {
  const provider = withCanonicalIdsForGroq(groq);
  loadBundledCatalog("groq", provider);
  expect(provider.languageModel("alibaba/qwen3.8-27b").modelId).toBe("qwen/qwen3.8-27b");
});

test("withCanonicalIdsForGroq > supports extra mapping override", () => {
  const provider = withCanonicalIdsForGroq(groq, {
    "meta/llama-3.3-70b-instruct": "llama-3.3-70b-versatile",
  });
  expect(provider.languageModel("meta/llama-3.3-70b-instruct").modelId).toBe(
    "llama-3.3-70b-versatile",
  );
});
