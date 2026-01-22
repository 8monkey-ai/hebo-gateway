import { gateway } from "#/";
import { gptOss } from "#/models/presets/gpt-oss";
import { Hono } from "hono";

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

export default new Hono().mount("/v1/gateway/", gw.handler);

console.log(`🐒 Hebo Gateway is running with Hono framework`);
