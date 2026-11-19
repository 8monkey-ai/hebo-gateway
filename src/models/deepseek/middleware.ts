import { modelMiddlewareMatcher } from "../../middleware/matcher.ts";
import { thinkingReasoningMiddleware } from "../../middleware/thinking.ts";

// https://api-docs.deepseek.com/guides/reasoning_model
export const deepseekReasoningMiddleware = thinkingReasoningMiddleware("deepseek", {
  toggle: true,
  effort: ["low", "high", "max"],
});

modelMiddlewareMatcher.useForModel("deepseek/*", {
  language: [deepseekReasoningMiddleware],
});
