import { gateway } from "#/";
import { gptOss } from "#/models/presets/gpt-oss";

const gw = gateway({
  models: Object.assign(
    {},
    ...gptOss.map((model) =>
      model({
        providers: ["groq"],
      }),
    ),
  ),
});

export const GET = gw.handler,
  POST = gw.handler;
