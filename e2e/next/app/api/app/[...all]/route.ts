import { gateway, createModelCatalog } from "#/";

const gw = gateway({
  basePath: "/api/app/gateway",
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

export const POST = gw.handler,
  GET = gw.handler;
