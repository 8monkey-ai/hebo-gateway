import { createCamelCaseProviderOptionsMiddleware } from "../../middleware/camel-case";
import { modelMiddlewareMatcher } from "../../middleware/matcher";

modelMiddlewareMatcher.useForProvider("google.vertex.*", {
  embedding: createCamelCaseProviderOptionsMiddleware("google"),
});
