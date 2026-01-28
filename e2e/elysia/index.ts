import { Elysia } from "elysia";

import { createModelCatalog, gateway } from "#/";
import { gptOss } from "#/models/presets/gpt-oss";
import { llama } from "#/models/presets/llama";
import { voyage } from "#/models/presets/voyage";
import { groqWithCanonicalIds } from "#/providers/canonical/groq";
import { voyageWithCanonicalIds } from "#/providers/canonical/voyage";

const gw = gateway({
  providers: {
    groq: groqWithCanonicalIds(),
    voyage: voyageWithCanonicalIds(),
  },
  models: createModelCatalog(
    ...gptOss["all"].map((preset) => preset({})),
    ...voyage["all"].map((preset) => preset({})),
    ...llama["all"].map((preset) => preset({})),
  ),
});

const app = new Elysia().mount("/v1/gateway/", gw.handler).listen(3000);

console.log(`🐒 Hebo Gateway is running with Elysia at ${app.server?.url}`);
