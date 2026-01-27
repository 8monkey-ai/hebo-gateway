import { createProviderRegistry } from "ai";
import { Elysia } from "elysia";

import {
  createModelCatalog,
  gateway,
  groqWithCanonicalIds,
  voyageWithCanonicalIds,
  gptOss,
  voyage,
  llama,
} from "#/";

const gw = gateway({
  providers: createProviderRegistry({
    groq: groqWithCanonicalIds(),
    voyage: voyageWithCanonicalIds(),
  }),
  models: createModelCatalog(
    ...gptOss["all"].map((model) => model({})),
    ...voyage["all"].map((model) => model({})),
    ...llama["all"].map((model) => model({})),
  ),
});

const app = new Elysia().mount("/v1/gateway/", gw.handler).listen(3000);

console.log(`🐒 Hebo Gateway is running with Elysia at ${app.server?.url}`);
