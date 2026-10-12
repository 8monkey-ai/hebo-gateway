import { expect, test } from "bun:test";

import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";

import { withCanonicalIdsForBedrock } from "./canonical";

test("withCanonicalIdsForBedrock > maps Claude Opus 5.5 to inference profile without version postfix", () => {
  const provider = withCanonicalIdsForBedrock(createAmazonBedrock({ region: "us-east-1" }));
  const model = provider.languageModel("anthropic/claude-opus-5.5");
  expect(model.modelId).toBe("us.anthropic.claude-opus-5-5");
});

test("withCanonicalIdsForBedrock > maps Claude Fable 5.1 to inference profile without version postfix", () => {
  const provider = withCanonicalIdsForBedrock(createAmazonBedrock({ region: "us-east-1" }));
  const model = provider.languageModel("anthropic/claude-fable-5.1");
  expect(model.modelId).toBe("us.anthropic.claude-fable-5-1");
});

test("withCanonicalIdsForBedrock > maps Claude Opus 5 to inference profile without version postfix", () => {
  const provider = withCanonicalIdsForBedrock(createAmazonBedrock({ region: "us-east-1" }));
  const model = provider.languageModel("anthropic/claude-opus-5");
  expect(model.modelId).toBe("us.anthropic.claude-opus-5");
});

test("withCanonicalIdsForBedrock > maps Claude Sonnet 5 to inference profile without version postfix", () => {
  const provider = withCanonicalIdsForBedrock(createAmazonBedrock({ region: "us-east-1" }));
  const model = provider.languageModel("anthropic/claude-sonnet-5");
  expect(model.modelId).toBe("us.anthropic.claude-sonnet-5");
});

type BedrockSettings = Parameters<typeof createAmazonBedrock>[0] & object;
type CanonicalConfig = Parameters<typeof withCanonicalIdsForBedrock>[1] & object;
type CapturedRequest = { url: string; headers: Headers };

// ---------------------------------------------------------------------------
// Claude routes through the nested Anthropic provider (InvokeModel)
// ---------------------------------------------------------------------------

const anthropicCases = [
  { canonical: "anthropic/claude-opus-5.5", native: "us.anthropic.claude-opus-5-5" },
  {
    canonical: "anthropic/claude-haiku-4.5",
    native: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
  },
  // Not in the mapping: resolved by the fallback affixes, same as on Converse.
  { canonical: "anthropic/claude-opus-9", native: "us.anthropic.claude-opus-9-v1:0" },
] as const;

for (const { canonical, native } of anthropicCases) {
  test(`withCanonicalIdsForBedrock > routes ${canonical} to InvokeModel`, () => {
    const provider = withCanonicalIdsForBedrock(createAmazonBedrock({ region: "us-east-1" }));
    const model = provider.languageModel(canonical);

    // Converse and InvokeModel take the same IDs, inference profiles included.
    expect(model.modelId).toBe(native);
    expect(model.provider).toBe("bedrock.anthropic.messages");
  });
}

test("withCanonicalIdsForBedrock > keeps Claude on Converse when the nested provider is off", () => {
  const provider = withCanonicalIdsForBedrock(createAmazonBedrock({ region: "us-east-1" }), {
    anthropic: false,
  });
  const model = provider.languageModel("anthropic/claude-haiku-4.5");

  expect(model.modelId).toBe("us.anthropic.claude-haiku-4-5-20251001-v1:0");
  expect(model.provider).toBe("amazon-bedrock");
});

test("withCanonicalIdsForBedrock > reuses the Anthropic model instance across lookups", () => {
  const provider = withCanonicalIdsForBedrock(createAmazonBedrock({ region: "us-east-1" }));

  expect(provider.languageModel("anthropic/claude-opus-5")).toBe(
    provider.languageModel("anthropic/claude-opus-5"),
  );
});

// ---------------------------------------------------------------------------
// The nested Anthropic provider inherits the auth of the wrapped instance
// ---------------------------------------------------------------------------

/** Captures the request the Claude model would send, without hitting the network. */
async function captureAnthropicRequest(
  settings: BedrockSettings,
  config: CanonicalConfig = {},
): Promise<CapturedRequest> {
  let captured: CapturedRequest | undefined;

  const fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    captured = {
      url: input instanceof Request ? input.url : String(input),
      headers: new Headers(init?.headers),
    };
    throw new Error("captured");
  }) as unknown as typeof globalThis.fetch;

  const provider = withCanonicalIdsForBedrock(createAmazonBedrock({ ...settings, fetch }), {
    ...config,
    // Own settings put the nested provider on its own transport, so it needs the capture too.
    anthropic: config.anthropic && { ...config.anthropic, fetch },
  });

  // The capturing fetch always throws, so only the request itself is asserted on.
  try {
    await provider
      .languageModel("anthropic/claude-haiku-4.5")
      .doGenerate({ prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }] });
  } catch {
    // expected
  }

  return captured!;
}

test("Anthropic uses the InvokeModel route on the host of the wrapped provider", async () => {
  const { url } = await captureAnthropicRequest({
    region: "ap-southeast-2",
    apiKey: "provider-key",
  });

  expect(url).toBe(
    "https://bedrock-runtime.ap-southeast-2.amazonaws.com/model/us.anthropic.claude-haiku-4-5-20251001-v1%3A0/invoke",
  );
});

test("Anthropic keeps the custom base URL of the wrapped provider", async () => {
  const { url } = await captureAnthropicRequest({
    region: "eu-west-1",
    apiKey: "provider-key",
    baseURL: "https://bedrock-runtime.eu-west-1.example.com",
  });

  expect(url).toStartWith("https://bedrock-runtime.eu-west-1.example.com/model/");
});

test("Anthropic forwards the custom headers of the wrapped provider", async () => {
  const { headers } = await captureAnthropicRequest({
    region: "eu-west-1",
    apiKey: "provider-key",
    headers: { "x-custom": "yes" },
  });

  expect(headers.get("x-custom")).toBe("yes");
});

test("Anthropic inherits the bearer token of the wrapped provider", async () => {
  const { headers } = await captureAnthropicRequest({
    region: "eu-west-1",
    apiKey: "provider-key",
  });

  // The placeholder that keeps the nested provider off its own credentials never leaks.
  expect(headers.get("authorization")).toBe("Bearer provider-key");
});

test("Anthropic inherits the request signing of the wrapped provider", async () => {
  const { headers } = await captureAnthropicRequest({
    region: "us-east-2",
    // Credentials never leave the `createAmazonBedrock` closure, but its signing fetch does.
    credentialProvider: () =>
      Promise.resolve({ accessKeyId: "AKIAEXAMPLE", secretAccessKey: "secret" }),
  });

  expect(headers.get("authorization")).toStartWith("AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE/");
  expect(headers.get("authorization")).toContain("/us-east-2/bedrock/aws4_request");
});

test("Anthropic settings take precedence over the inherited ones", async () => {
  const { url, headers } = await captureAnthropicRequest(
    { region: "eu-west-1", apiKey: "provider-key" },
    { anthropic: { region: "us-gov-west-1", apiKey: "anthropic-key" } },
  );

  // Explicit credentials put the nested provider back on its own auth, base URL included.
  expect(url).toStartWith("https://bedrock-runtime.us-gov-west-1.amazonaws.com/model/");
  expect(headers.get("authorization")).toBe("Bearer anthropic-key");
});

// ---------------------------------------------------------------------------
// GPT-5.5+ and GPT-6 route through the nested Mantle provider
// ---------------------------------------------------------------------------

const mantleCases = [
  { canonical: "openai/gpt-5.5", native: "openai.gpt-5.5" },
  { canonical: "openai/gpt-5.6-sol", native: "openai.gpt-5.6-sol" },
  { canonical: "openai/gpt-5.6-terra", native: "openai.gpt-5.6-terra" },
  { canonical: "openai/gpt-5.6-luna", native: "openai.gpt-5.6-luna" },
  { canonical: "openai/gpt-6-astra", native: "openai.gpt-6-astra" },
  { canonical: "openai/gpt-6-sol", native: "openai.gpt-6-sol" },
  { canonical: "openai/gpt-6-luna", native: "openai.gpt-6-luna" },
] as const;

for (const { canonical, native } of mantleCases) {
  test(`withCanonicalIdsForBedrock > routes ${canonical} to the Mantle Responses API`, () => {
    const provider = withCanonicalIdsForBedrock(createAmazonBedrock({ region: "us-east-1" }));
    const model = provider.languageModel(canonical);

    // No inference profile prefix and no `-v1:0` postfix: on-demand only, dotted version kept.
    expect(model.modelId).toBe(native);
    expect(model.provider).toBe("bedrock-mantle.responses");
  });

  test(`withCanonicalIdsForBedrock > routes ${canonical} to Mantle when avoiding inference profiles`, () => {
    const provider = withCanonicalIdsForBedrock(createAmazonBedrock({ region: "us-east-1" }), {
      inferenceProfile: { mode: "avoid" },
    });
    const model = provider.languageModel(canonical);

    expect(model.modelId).toBe(native);
    expect(model.provider).toBe("bedrock-mantle.responses");
  });
}

test("withCanonicalIdsForBedrock > keeps GPT-OSS on the native Converse provider", () => {
  const provider = withCanonicalIdsForBedrock(createAmazonBedrock({ region: "us-east-1" }));
  const model = provider.languageModel("openai/gpt-oss-120b");

  expect(model.modelId).toBe("openai.gpt-oss-120b-1:0");
  expect(model.provider).toBe("amazon-bedrock");
});

// ---------------------------------------------------------------------------
// The nested Mantle provider inherits what the wrapped instance exposes
// ---------------------------------------------------------------------------

/** Captures the request the Mantle model would send, without hitting the network. */
async function captureMantleRequest(
  build: (fetch: typeof globalThis.fetch) => ReturnType<typeof withCanonicalIdsForBedrock>,
): Promise<CapturedRequest> {
  let captured: CapturedRequest | undefined;

  const provider = build(((input: RequestInfo | URL, init?: RequestInit) => {
    captured = {
      url: input instanceof Request ? input.url : String(input),
      headers: new Headers(init?.headers),
    };
    throw new Error("captured");
  }) as unknown as typeof globalThis.fetch);

  // The capturing fetch always throws, so only the request itself is asserted on.
  try {
    await provider
      .languageModel("openai/gpt-5.6-sol")
      .doGenerate({ prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }] });
  } catch {
    // expected
  }

  return captured!;
}

/**
 * An instance hides its credentials, so Mantle takes its own. The API key keeps it off SigV4,
 * so no ambient credentials are consulted.
 */
const fromInstance = (settings: BedrockSettings = {}, config: CanonicalConfig = {}) =>
  captureMantleRequest((fetch) =>
    withCanonicalIdsForBedrock(
      createAmazonBedrock({ region: "eu-west-1", apiKey: "provider-key", ...settings }),
      { ...config, mantle: { apiKey: "mantle-key", fetch, ...config.mantle } },
    ),
  );

// Mantle serves the `openai.gpt-*` (non-OSS), `google.gemma-4` and `xai.*` IDs under its
// separate `openai/v1` route rather than the plain `v1` one; the rest of the path below is
// incidental to these tests, which pin down how the host and region get resolved.
test("Mantle uses the region resolved by the wrapped provider", async () => {
  const { url } = await fromInstance({ region: "ap-southeast-2" });

  expect(url).toBe("https://bedrock-mantle.ap-southeast-2.api.aws/openai/v1/responses");
});

test("Mantle forwards the custom headers of the wrapped provider", async () => {
  const { headers } = await fromInstance({ headers: { "x-custom": "yes" } });

  expect(headers.get("x-custom")).toBe("yes");
  expect(headers.get("authorization")).toBe("Bearer mantle-key");
});

test("Mantle keeps its own base URL when the wrapped provider overrides the Converse one", async () => {
  const { url } = await fromInstance({ baseURL: "https://bedrock-runtime.eu-west-1.example.com" });

  expect(url).toBe("https://bedrock-mantle.eu-west-1.api.aws/openai/v1/responses");
});

test("Mantle settings take precedence over the inherited ones", async () => {
  const { url } = await fromInstance({}, { mantle: { region: "us-gov-west-1" } });

  expect(url).toBe("https://bedrock-mantle.us-gov-west-1.api.aws/openai/v1/responses");
});

test("Mantle ignores a base URL label that is not a region", async () => {
  const previous = process.env["AWS_REGION"];
  process.env["AWS_REGION"] = "us-east-2";
  try {
    // `internal` is not a region, so inheriting it would point Mantle at a host that
    // does not resolve. Its own settings have to win instead.
    const { url } = await fromInstance({ baseURL: "https://bedrock.internal.example.com" });

    expect(url).toBe("https://bedrock-mantle.us-east-2.api.aws/openai/v1/responses");
  } finally {
    process.env["AWS_REGION"] = previous;
  }
});

test("Mantle keeps the inherited headers when the region is unresolvable", async () => {
  const previous = process.env["AWS_REGION"];
  delete process.env["AWS_REGION"];
  try {
    // Without a region the wrapped base URL throws, which must not cost the headers.
    const { url, headers } = await fromInstance(
      { region: undefined, headers: { "x-custom": "yes" } },
      { mantle: { region: "us-east-1" } },
    );

    expect(url).toBe("https://bedrock-mantle.us-east-1.api.aws/openai/v1/responses");
    expect(headers.get("x-custom")).toBe("yes");
  } finally {
    process.env["AWS_REGION"] = previous;
  }
});

test("withCanonicalIdsForBedrock > reuses the Mantle model instance across lookups", () => {
  const provider = withCanonicalIdsForBedrock(createAmazonBedrock({ region: "us-east-1" }), {
    mantle: { apiKey: "mantle-key" },
  });

  expect(provider.languageModel("openai/gpt-5.6-sol")).toBe(
    provider.languageModel("openai/gpt-5.6-sol"),
  );
});
