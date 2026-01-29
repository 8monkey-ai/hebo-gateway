import { createCamelCaseProviderOptionsMiddleware } from "../../middleware/camel-case";
import { modelMiddlewareMatcher } from "../../middleware/matcher";

modelMiddlewareMatcher.useForProvider("groq.chat", {
  embedding: createCamelCaseProviderOptionsMiddleware("groq"),
});
