import { gateway, createModelCatalog, claudeSonnet45 } from "#/";
import { Hono } from "hono";

const gw = gateway({
  models: createModelCatalog({
    ...claudeSonnet45({
      providers: ["bedrock"],
    }),
  }),
});

export default new Hono().mount("/v1/gateway/", gw.handler);

console.log(`🐒 Hebo Gateway is running with Hono framework`);
