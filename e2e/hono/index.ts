import { gateway, createModelCatalog } from "#/";
import { Hono } from "hono";

const gw = gateway({
  models: createModelCatalog({
    "anthropic/claude-sonnet-4.5": {
      name: "Claude Sonnet 4.5",
      created: "2025-09-29",
      knowledge: "2025-07",
      modalities: {
        input: ["text", "image", "pdf", "audio", "video"],
        output: ["text"],
      },
      context: 200000,
      capabilities: ["attachments", "reasoning", "tool_call", "structured_output", "temperature"],
      providers: ["bedrock"],
    },
  }),
});

const hono = new Hono();
hono.mount("/v1/gateway/", gw.handler);

export default hono;

console.log(`🐒 Hebo Gateway is running with Hono framework`);
