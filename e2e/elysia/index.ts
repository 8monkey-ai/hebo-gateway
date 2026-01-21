import { gateway, createModelCatalog } from "#/";
import { Elysia } from "elysia";

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

const app = new Elysia().mount("/v1/gateway/", gw.handler).listen(3000);

console.log(`🐒 Hebo Gateway is running with Elysia at ${app.server?.url}`);
