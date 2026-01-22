import { gateway, createModelCatalog, claudeSonnet45 } from "#/";
import { Elysia } from "elysia";

const gw = gateway({
  models: createModelCatalog({
    ...claudeSonnet45({
      providers: ["bedrock"],
    }),
  }),
});

const app = new Elysia().mount("/v1/gateway/", gw.handler).listen(3000);

console.log(`🐒 Hebo Gateway is running with Elysia at ${app.server?.url}`);
