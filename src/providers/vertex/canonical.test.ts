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

// Dotted Gemini versions keep their delimiter, so no explicit mapping is needed.
test("dotted Gemini versions resolve without an explicit mapping", () => {
  const provider = withCanonicalIdsForVertex(vertex);
  const model = provider.languageModel("google/gemini-3.7-flash");
  expect(model.modelId).toBe("gemini-3.7-flash");
  expect(model.provider).toBe("google.vertex.chat");
});

// ---------------------------------------------------------------------------
// The MaaS override inherits the provider's project and credentials
// ---------------------------------------------------------------------------

/** Stubs google-auth-library so no ambient credentials are ever consulted. */
const authClientFor = (token: string) =>
  ({
    authClient: { getAccessToken: () => Promise.resolve({ token }) },
  }) as unknown as NonNullable<Parameters<typeof createVertex>[0]>["googleAuthOptions"];

/** Captures the request the MaaS model would send, without hitting the network. */
async function captureMaasRequest(
  settings: Omit<Parameters<typeof createVertex>[0], "fetch"> = {},
): Promise<{ url: string; headers: Headers }> {
  let captured: { url: string; headers: Headers } | undefined;

  const provider = withCanonicalIdsForVertex(
    createVertex({
      googleAuthOptions: authClientFor("configured-token"),
      ...settings,
      fetch: ((input: RequestInfo | URL, init?: RequestInit) => {
        captured = {
          url: input instanceof Request ? input.url : String(input),
          headers: new Headers(init?.headers),
        };
        throw new Error("captured");
      }) as unknown as typeof fetch,
    }),
  );

  // The capturing fetch always throws, so only the request itself is asserted on.
  try {
    await provider
      .languageModel("google/gemma-4-26b-a4b")
      .doGenerate({ prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }] });
  } catch {
    // expected
  }

  return captured!;
}

test("MaaS override uses the provider's project instead of GOOGLE_VERTEX_PROJECT", async () => {
  const { url } = await captureMaasRequest({ project: "my-project", location: "us-central1" });

  expect(url).toContain("/projects/my-project/");
  expect(url).not.toContain("test-project");
  // Gemma is only served from the global MaaS endpoint.
  expect(url).toContain("/locations/global/");
});

test("MaaS override authenticates with the provider's googleAuthOptions", async () => {
  const { headers } = await captureMaasRequest({
    project: "my-project",
    location: "us-central1",
  });

  expect(headers.get("authorization")).toBe("Bearer configured-token");
});

test("MaaS override forwards the provider's custom headers", async () => {
  const { headers } = await captureMaasRequest({
    project: "my-project",
    location: "us-central1",
    headers: { "x-custom": "yes" },
  });

  expect(headers.get("x-custom")).toBe("yes");
  expect(headers.get("authorization")).toBe("Bearer configured-token");
});

test("MaaS override falls back to GOOGLE_VERTEX_PROJECT when no project is configured", async () => {
  const { url } = await captureMaasRequest({ location: "us-central1" });

  expect(url).toContain("/projects/test-project/");
});
