import { expect, test } from "bun:test";

import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";

import { withCanonicalIdsForBedrock } from "./canonical";

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

// ---------------------------------------------------------------------------
// GPT-5.x routes through the nested Mantle provider
// ---------------------------------------------------------------------------

const mantleCases = [
  { canonical: "openai/gpt-5.5", native: "openai.gpt-5.5" },
  { canonical: "openai/gpt-5.6-sol", native: "openai.gpt-5.6-sol" },
  { canonical: "openai/gpt-5.6-terra", native: "openai.gpt-5.6-terra" },
  { canonical: "openai/gpt-5.6-luna", native: "openai.gpt-5.6-luna" },
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
// The Mantle override inherits the provider's region and headers
// ---------------------------------------------------------------------------

/** Captures the request the Mantle model would send, without hitting the network. */
async function captureMantleRequest(
  settings: Parameters<typeof createAmazonBedrock>[0] = {},
  config: Parameters<typeof withCanonicalIdsForBedrock>[1] = {},
): Promise<{ url: string; headers: Headers }> {
  let captured: { url: string; headers: Headers } | undefined;

  const provider = withCanonicalIdsForBedrock(
    // The API key keeps Mantle off SigV4, so no ambient credentials are consulted.
    createAmazonBedrock({ region: "eu-west-1", apiKey: "provider-key", ...settings }),
    {
      ...config,
      mantle: {
        apiKey: "mantle-key",
        ...config.mantle,
        fetch: ((input: RequestInfo | URL, init?: RequestInit) => {
          captured = {
            url: input instanceof Request ? input.url : String(input),
            headers: new Headers(init?.headers),
          };
          throw new Error("captured");
        }) as unknown as typeof fetch,
      },
    },
  );

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

test("Mantle override uses the region resolved by the wrapped provider", async () => {
  const { url } = await captureMantleRequest({ region: "ap-southeast-2" });

  expect(url).toBe("https://bedrock-mantle.ap-southeast-2.api.aws/v1/responses");
});

test("Mantle override forwards the provider's custom headers", async () => {
  const { headers } = await captureMantleRequest({ headers: { "x-custom": "yes" } });

  expect(headers.get("x-custom")).toBe("yes");
  expect(headers.get("authorization")).toBe("Bearer mantle-key");
});

test("Mantle settings take precedence over the inherited ones", async () => {
  const { url } = await captureMantleRequest({}, { mantle: { region: "us-gov-west-1" } });

  expect(url).toBe("https://bedrock-mantle.us-gov-west-1.api.aws/v1/responses");
});
