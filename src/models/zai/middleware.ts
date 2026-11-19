import { modelMiddlewareMatcher } from "../../middleware/matcher.ts";
import { thinkingReasoningMiddleware } from "../../middleware/thinking.ts";

// GLM 4.x and 5.x take a thinking toggle, GLM 5.2 and later effort levels.
// https://docs.z.ai/guides/capabilities/thinking
export const glmReasoningMiddleware = thinkingReasoningMiddleware("zhipu", {
  effort: ["low", "high", "max"],
});

modelMiddlewareMatcher.useForModel("zhipuai/*", {
  language: [glmReasoningMiddleware],
});
