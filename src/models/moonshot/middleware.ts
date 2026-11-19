import { modelMiddlewareMatcher } from "../../middleware/matcher.ts";
import { thinkingReasoningMiddleware } from "../../middleware/thinking.ts";

// Kimi K2.x takes a thinking toggle, K3 effort levels.
export const moonshotReasoningMiddleware = thinkingReasoningMiddleware("moonshotai", {
  effort: ["low", "high", "max"],
});

modelMiddlewareMatcher.useForModel("moonshotai/*", {
  language: [moonshotReasoningMiddleware],
});
