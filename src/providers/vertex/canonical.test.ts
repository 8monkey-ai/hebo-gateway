import { expect, test } from "bun:test";

import { createVertex } from "@ai-sdk/google-vertex";
import { createVertexMaas } from "@ai-sdk/google-vertex/maas";

import { withCanonicalIdsForVertex } from "./canonical";

const vertex = createVertex({ apiKey: "test-key", project: "test-project", location: "global" });
const maas = createVertexMaas({ project: "test-project" });

test("without maas: google/gemma-4-26b-a4b maps to the generateContent MaaS ID", () => {
  const provider = withCanonicalIdsForVertex(vertex);
  const model = provider.languageModel("google/gemma-4-26b-a4b");
  expect(model.modelId).toBe("gemma-4-26b-a4b-it-maas");
  expect(model.provider).toBe("google.vertex.chat");
});

test("with maas: google/gemma-4-26b-a4b routes to the MaaS OpenAI-compatible provider", () => {
  const provider = withCanonicalIdsForVertex(vertex, undefined, maas);
  const model = provider.languageModel("google/gemma-4-26b-a4b");
  expect(model.modelId).toBe("google/gemma-4-26b-a4b-it-maas");
  expect(model.provider).toBe("vertex.maas.chat");
});

test("with maas: other models still fall back to the native provider", () => {
  const provider = withCanonicalIdsForVertex(vertex, undefined, maas);
  const model = provider.languageModel("google/gemini-3-flash-preview");
  expect(model.modelId).toBe("gemini-3-flash-preview");
  expect(model.provider).toBe("google.vertex.chat");
});
