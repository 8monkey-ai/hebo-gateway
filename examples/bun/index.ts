import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { defineModelCatalog, gateway } from "@hebo-ai/gateway";
import { claude } from "@hebo-ai/gateway/models/anthropic";
import { withCanonicalIdsForBedrock } from "@hebo-ai/gateway/providers/bedrock";

const gw = gateway({
  basePath: "/v1/gateway",
  logger: { level: "trace" },
  providers: {
    bedrock: withCanonicalIdsForBedrock(
      createAmazonBedrock({
        region: "us-east-1",
        credentialProvider: fromNodeProviderChain(),
      }),
    ),
  },
  models: defineModelCatalog(claude["all"]),
});

const server = Bun.serve({
  port: 3000,
  fetch: (request) => gw.handler(request),
});

console.log(`🐒 Hebo Gateway is running with Bun on ${server?.url}`);
