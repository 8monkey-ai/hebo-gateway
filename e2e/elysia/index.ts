import { createModelCatalog, gateway } from "#/";
import { gptOss } from "#/models/presets/gpt-oss";
import { Elysia } from "elysia";

const gw = gateway({
  models: createModelCatalog(
    ...gptOss.map((model) =>
      model({
        providers: ["groq"],
      }),
    ),
  ),
});

const app = new Elysia().mount("/v1/gateway/", gw.handler).listen(3000);

console.log(`🐒 Hebo Gateway is running with Elysia at ${app.server?.url}`);
