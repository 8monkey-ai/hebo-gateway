import { gateway, createModelCatalog } from "#/";
import { claudeSonnet45 } from "#/model-catalog/presets/claude45";

const gw = gateway({
  models: createModelCatalog({
    ...claudeSonnet45({
      providers: ["bedrock"],
    }),
  }),
});

export const POST = gw.handler,
  GET = gw.handler;
