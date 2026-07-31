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

// ---------------------------------------------------------------------------
// MaaS override inherits the provider's project / credentials / fetch
// ---------------------------------------------------------------------------

const PROMPT = [{ role: "user" as const, content: [{ type: "text" as const, text: "hi" }] }];

/** Captures the request the MaaS model would send, without hitting the network. */
async function captureMaasRequest(
  settings: Omit<Parameters<typeof createVertex>[0], "fetch"> = {},
) {
  let captured: { url: string; headers: Headers } | undefined;

  const provider = withCanonicalIdsForVertex(
    createVertex({
      ...settings,
      fetch: ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        captured = {
          url: input instanceof Request ? input.url : String(input),
          headers: new Headers(init?.headers),
        };
        throw new Error("captured");
      }) as typeof fetch,
    }),
  );

  // The capturing fetch always throws, so only the request itself is asserted on.
  try {
    await provider.languageModel("google/gemma-4-26b-a4b").doGenerate({ prompt: PROMPT });
  } catch {
    // expected
  }

  return captured!;
}

/** Stubs google-auth-library so no ambient credentials are ever consulted. */
const authClientFor = (token: string) =>
  ({
    authClient: { getAccessToken: () => Promise.resolve({ token }) },
  }) as unknown as NonNullable<Parameters<typeof createVertex>[0]>["googleAuthOptions"];

test("MaaS override uses the provider's project instead of GOOGLE_VERTEX_PROJECT", async () => {
  const { url } = await captureMaasRequest({
    project: "my-project",
    location: "us-central1",
    googleAuthOptions: authClientFor("configured-token"),
  });

  expect(url).toContain("/projects/my-project/");
  expect(url).not.toContain("test-project");
  // Gemma is only served from the global MaaS endpoint.
  expect(url).toContain("/locations/global/");
});

test("MaaS override authenticates with the provider's googleAuthOptions", async () => {
  const { headers } = await captureMaasRequest({
    project: "my-project",
    location: "us-central1",
    googleAuthOptions: authClientFor("configured-token"),
  });

  expect(headers.get("authorization")).toBe("Bearer configured-token");
});

test("MaaS override forwards the provider's custom headers", async () => {
  const { headers } = await captureMaasRequest({
    project: "my-project",
    location: "us-central1",
    headers: { "x-custom": "yes" },
    googleAuthOptions: authClientFor("configured-token"),
  });

  expect(headers.get("x-custom")).toBe("yes");
  expect(headers.get("authorization")).toBe("Bearer configured-token");
});

test("MaaS override falls back to GOOGLE_VERTEX_PROJECT when no project is configured", async () => {
  const { url } = await captureMaasRequest({
    location: "us-central1",
    googleAuthOptions: authClientFor("configured-token"),
  });

  expect(url).toContain("/projects/test-project/");
});
