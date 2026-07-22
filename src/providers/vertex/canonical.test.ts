import { afterAll, expect, test } from "bun:test";

import { createVertex } from "@ai-sdk/google-vertex";

import { withCanonicalIdsForVertex } from "./canonical";

// The MaaS provider built inside withCanonicalIdsForVertex resolves its project
// from GOOGLE_VERTEX_PROJECT; restore the prior value so we don't leak into other suites.
const prevProject = process.env["GOOGLE_VERTEX_PROJECT"];
process.env["GOOGLE_VERTEX_PROJECT"] = "test-project";

afterAll(() => {
  if (prevProject === undefined) delete process.env["GOOGLE_VERTEX_PROJECT"];
  else process.env["GOOGLE_VERTEX_PROJECT"] = prevProject;
});

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
