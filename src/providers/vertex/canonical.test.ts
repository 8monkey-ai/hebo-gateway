import { expect, test } from "bun:test";

import { createVertex } from "@ai-sdk/google-vertex";

import { withCanonicalIdsForVertex } from "./canonical";

process.env["GOOGLE_VERTEX_PROJECT"] = "test-project";

const vertex = createVertex({
  apiKey: "test-key",
  project: "test-project",
  location: "us-central1",
});

test("google/gemma-4-26b-a4b routes to the MaaS OpenAI-compatible provider", () => {
  const provider = withCanonicalIdsForVertex(vertex);
  const model = provider.languageModel("google/gemma-4-26b-a4b");
  expect(model.modelId).toBe("google/gemma-4-26b-a4b-it-maas");
  expect(model.provider).toBe("vertex.maas.chat");
});

test("other models fall back to the native provider", () => {
  const provider = withCanonicalIdsForVertex(vertex);
  const model = provider.languageModel("google/gemini-3-flash-preview");
  expect(model.modelId).toBe("gemini-3-flash-preview");
  expect(model.provider).toBe("google.vertex.chat");
});
