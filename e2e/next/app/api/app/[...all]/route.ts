import { gateway } from "#/";
import { claudeSonnet45 } from "#/model-catalog/presets/claude45";

const gw = gateway({
  models: {
    ...claudeSonnet45({
      providers: ["bedrock"],
    }),
  },
});

export const POST = gw.handler,
  GET = gw.handler;
