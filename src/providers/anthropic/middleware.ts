import { createCamelCaseProviderOptionsMiddleware } from "../../middleware/camel-case";
import { modelMiddlewareMatcher } from "../../middleware/matcher";

modelMiddlewareMatcher.useForProvider("anthropic.messages", {
  embedding: createCamelCaseProviderOptionsMiddleware("anthropic"),
});
