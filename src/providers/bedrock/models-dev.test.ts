import { expect, test } from "bun:test";

// oxlint-disable-next-line no-unassigned-import
import "./canonical.ts";
import { fromModelsDev, type ModelsDevApi, type ModelsDevModel } from "../../models/models-dev.ts";

const LABS = [{ namespace: "openai", provider: "openai" as const }];

const chat = (canonicalId: string, model: ModelsDevModel = {}): ModelsDevModel => ({
  canonical_model_id: canonicalId,
  reasoning: true,
  modalities: { input: ["text"], output: ["text"] },
  ...model,
});

test("amazon-bedrock > collapses inference profiles and marks Mantle models", () => {
  const bedrock = (id: string, model: ModelsDevModel = {}) => [
    id,
    chat(`openai/${id.split(".").at(-1)!.replace(/-1:0$/u, "")}`, model),
  ];
  const mantle = { provider: { npm: "@ai-sdk/amazon-bedrock/mantle" } };
  const api: ModelsDevApi = {
    "amazon-bedrock": {
      models: Object.fromEntries([
        // Converse on demand, and through a profile.
        bedrock("openai.gpt-a"),
        bedrock("us.openai.gpt-a"),
        // Profiles only.
        bedrock("global.openai.gpt-b"),
        // Mantle, its profiles are ignored.
        bedrock("openai.gpt-c", mantle),
        bedrock("us.openai.gpt-c"),
        // Converse wins over Mantle; a `us-gov` profile is no reason to use profiles.
        bedrock("openai.gpt-d", mantle),
        bedrock("openai.gpt-d-1:0"),
        bedrock("us-gov.openai.gpt-d-1:0"),
      ]) as Record<string, ModelsDevModel>,
    },
  };

  const providers = Object.entries(fromModelsDev(api, LABS)).map(([id, m]) => [
    id,
    m!.providers.bedrock,
  ]);
  expect(Object.fromEntries(providers)).toEqual({
    "openai/gpt-a": { id: "openai.gpt-a", profile: "optional" },
    "openai/gpt-b": { id: "openai.gpt-b", profile: "required" },
    "openai/gpt-c": { id: "openai.gpt-c", route: "mantle" },
    "openai/gpt-d": { id: "openai.gpt-d-1:0" },
  });
});

test("amazon-bedrock > skips ARNs and unknown inference profile prefixes", () => {
  const api: ModelsDevApi = {
    "amazon-bedrock": {
      models: Object.fromEntries(
        [
          "arn:aws:bedrock:us-east-1:123456789012:inference-profile/us.openai.gpt-x",
          "xx.openai.gpt-x",
          "us.zz.openai.gpt-x",
        ].map((id) => [id, chat("openai/gpt-x")]),
      ),
    },
    groq: { models: { "openai/gpt-x": chat("openai/gpt-x") } },
  };

  expect(fromModelsDev(api, LABS)["openai/gpt-x"]?.providers).toEqual({
    groq: { id: "openai/gpt-x" },
  });
});

test("amazon-bedrock > takes limits from the plain listing, not a GovCloud or regional one", () => {
  const listing = (name: string, output: number) =>
    chat("openai/gpt-oss-20b", { name, limit: { context: 128000, output } });
  const api: ModelsDevApi = {
    "amazon-bedrock": {
      models: {
        // GovCloud and regional listings first, as in models.dev's data.
        "us-gov.openai.gpt-oss-20b-1:0": listing("gpt-oss-20b (GovCloud)", 16384),
        "eu.openai.gpt-oss-20b-1:0": listing("gpt-oss-20b (EU)", 32768),
        "openai.gpt-oss-20b-1:0": listing("gpt-oss-20b", 128000),
      },
    },
  };

  const model = fromModelsDev(api, LABS)["openai/gpt-oss-20b"];
  expect(model?.name).toBe("gpt-oss-20b");
  expect(model?.providers.bedrock).toEqual({
    id: "openai.gpt-oss-20b-1:0",
    profile: "optional",
    output: 128000,
  });
});

test("amazon-bedrock > prefers a regional profile's limits over GovCloud's", () => {
  const listing = (output: number) => chat("openai/gpt-e", { limit: { output } });
  const api: ModelsDevApi = {
    "amazon-bedrock": {
      models: {
        "us-gov.openai.gpt-e": listing(16384),
        "us.openai.gpt-e": listing(128000),
      },
    },
  };

  expect(fromModelsDev(api, LABS)["openai/gpt-e"]?.providers.bedrock).toEqual({
    id: "openai.gpt-e",
    profile: "required",
    output: 128000,
  });
});
