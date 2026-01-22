import { gateway } from "#/";
import { claudeSonnet45 } from "#/models/presets/claude45";
import { Elysia } from "elysia";

const gw = gateway({
  models: {
    ...claudeSonnet45({
      providers: ["bedrock"],
    }),
  },
});

const app = new Elysia().mount("/v1/gateway/", gw.handler).listen(3000);

console.log(`🐒 Hebo Gateway is running with Elysia at ${app.server?.url}`);
