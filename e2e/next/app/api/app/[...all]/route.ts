import { gateway, createModelCatalog, claudeSonnet45 } from "#/";

const gw = gateway({
  models: createModelCatalog({
    ...claudeSonnet45({
      providers: ["bedrock"],
    }),
  }),
});

export const POST = gw.handler,
  GET = gw.handler;
