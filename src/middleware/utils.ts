import type { ChatCompletionsReasoningEffort } from "../endpoints/chat-completions/schema";
import { GatewayError } from "../errors/gateway";

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
    case "max":
      percentage = 1.0;
      break;
  }

  return Math.max(minTokens, Math.floor(maxTokens * percentage));
}

/** Throws a 400 for the first of `params` set in `options`. */
export function rejectUnsupportedParams(
  options: Record<string, unknown> | undefined,
  params: readonly string[],
  target: string,
) {
  if (!options) return;
  for (const param of params) {
    if (options[param] !== undefined) {
      throw new GatewayError(`Parameter '${param}' is not supported by ${target}`, 400);
    }
  }
}
