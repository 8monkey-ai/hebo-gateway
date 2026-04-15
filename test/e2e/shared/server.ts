import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createVertex } from "@ai-sdk/google-vertex";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";

import { type ModelCatalog, defineModelCatalog, gateway } from "../../../src";
import { withCanonicalIdsForBedrock } from "../../../src/providers/bedrock";
import { withCanonicalIdsForVertex } from "../../../src/providers/vertex";

// ---------------------------------------------------------------------------
// Bedrock credentials
// ---------------------------------------------------------------------------

export const BEDROCK_ACCESS_KEY_ID = process.env["BEDROCK_ACCESS_KEY_ID"];
export const BEDROCK_SECRET_ACCESS_KEY = process.env["BEDROCK_SECRET_ACCESS_KEY"];
export const BEDROCK_REGION = process.env["BEDROCK_REGION"] ?? "us-east-2";

// ---------------------------------------------------------------------------
// Vertex credentials
// ---------------------------------------------------------------------------

export const GOOGLE_VERTEX_API_KEY = process.env["GOOGLE_VERTEX_API_KEY"];
export const GOOGLE_VERTEX_PROJECT = process.env["GOOGLE_VERTEX_PROJECT"];
export const GOOGLE_VERTEX_LOCATION = process.env["GOOGLE_VERTEX_LOCATION"] ?? "us-central1";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ModelCatalogInput = ModelCatalog | (() => ModelCatalog);

export interface TestServer {
  server: ReturnType<typeof Bun.serve>;
  baseUrl: string;
}

// ---------------------------------------------------------------------------
// Bedrock
// ---------------------------------------------------------------------------

export function createBedrockTestServer(...presets: ModelCatalogInput[]): TestServer {
  // Prevent @ai-sdk/amazon-bedrock from inheriting CI's AWS_SESSION_TOKEN,
  // which conflicts with the static BEDROCK_* credentials.
  delete process.env["AWS_SESSION_TOKEN"];
  delete process.env["AWS_ACCESS_KEY_ID"];
  delete process.env["AWS_SECRET_ACCESS_KEY"];

  const bedrock = createAmazonBedrock({
    region: BEDROCK_REGION,
    credentialProvider:
      BEDROCK_ACCESS_KEY_ID && BEDROCK_SECRET_ACCESS_KEY
        ? () =>
            Promise.resolve({
              accessKeyId: BEDROCK_ACCESS_KEY_ID,
              secretAccessKey: BEDROCK_SECRET_ACCESS_KEY,
            })
        : fromNodeProviderChain(),
  });

  const gw = gateway({
    basePath: "/v1",
    logger: { level: "warn" },
    providers: {
      bedrock: withCanonicalIdsForBedrock(bedrock),
    },
    models: defineModelCatalog(...presets),
    timeouts: { normal: 120_000, flex: 360_000 },
  });

  const server = Bun.serve({
    port: 0,
    maxRequestBodySize: 10 * 1024 * 1024,
    fetch: (request) => gw.handler(request),
  });

  return { server, baseUrl: `http://localhost:${server.port}` };
}

// ---------------------------------------------------------------------------
// Vertex
// ---------------------------------------------------------------------------

export function createVertexTestServer(...presets: ModelCatalogInput[]): TestServer {
  const vertex = createVertex({
    apiKey: GOOGLE_VERTEX_API_KEY!,
    project: GOOGLE_VERTEX_PROJECT!,
    location: GOOGLE_VERTEX_LOCATION,
  });

  const gw = gateway({
    basePath: "/v1",
    logger: { level: "warn" },
    providers: {
      vertex: withCanonicalIdsForVertex(vertex),
    },
    models: defineModelCatalog(...presets),
    timeouts: { normal: 120_000, flex: 360_000 },
  });

  const server = Bun.serve({
    port: 0,
    maxRequestBodySize: 10 * 1024 * 1024,
    fetch: (request) => gw.handler(request),
  });

  return { server, baseUrl: `http://localhost:${server.port}` };
}
