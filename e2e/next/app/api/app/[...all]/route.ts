import { createModelCatalog, gateway } from "#/";
import { gptOss } from "#/models/presets/gpt-oss";

const gw = gateway({
  models: createModelCatalog(...gptOss["all"].map((model) => model({}))),
});

export const GET = gw.handler,
  POST = gw.handler;
