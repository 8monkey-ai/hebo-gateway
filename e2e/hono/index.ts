import { gateway } from "#/";
import { claudeSonnet45 } from "#/model-catalog/presets/claude45";
import { Hono } from "hono";

const gw = gateway({
  models: {
    ...claudeSonnet45({
      providers: ["bedrock"],
    }),
  },
});

export default new Hono().mount("/v1/gateway/", gw.handler);

console.log(`🐒 Hebo Gateway is running with Hono framework`);
