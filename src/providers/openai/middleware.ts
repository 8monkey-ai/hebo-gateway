import { createCamelCaseProviderOptionsMiddleware } from "../../middleware/camel-case";
import { modelMiddlewareMatcher } from "../../middleware/matcher";

modelMiddlewareMatcher.useForProvider("openai.*", {
  embedding: createCamelCaseProviderOptionsMiddleware("openai"),
});
