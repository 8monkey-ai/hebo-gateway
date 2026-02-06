import type { ChatCompletionsReasoningEffort } from "../endpoints/chat-completions/schema";

export function calculateReasoningBudgetFromEffort(
  effort: ChatCompletionsReasoningEffort,
  maxTokens: number,
  minTokens: number = 1024,
): number {
  let percentage = 0;
  switch (effort) {
    case "none":
      percentage = 0;
      break;
    case "minimal":
      percentage = 0.1;
      break;
    case "low":
      percentage = 0.2;
      break;
    case "medium":
      percentage = 0.5;
      break;
    case "high":
      percentage = 0.8;
      break;
    case "xhigh":
      percentage = 0.95;
      break;
    default:
      return 0;
  }

  return Math.max(minTokens, Math.floor(maxTokens * percentage));
}
