import { gateway } from "#/";
import { claudeSonnet45 } from "#/models/presets/claude45";

const gw = gateway({
  models: {
    ...claudeSonnet45({
      providers: ["bedrock"],
    }),
  },
});

export const POST = gw.handler,
  GET = gw.handler;
