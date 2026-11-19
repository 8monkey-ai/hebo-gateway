import type { LanguageModelV4CallOptions } from "@ai-sdk/provider";

import type { ChatCompletionsReasoningConfig } from "../endpoints/chat-completions/schema.ts";
import {
  type ModelSpec,
  type ReasoningControls,
  type ReasoningEffortLevel,
  REASONING_EFFORTS,
} from "../models/types.ts";
import { calculateReasoningBudgetFromEffort } from "./utils.ts";

/** Output limit assumed for reasoning budgets when neither the request nor the model sets one. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 32_000;

/**
 * Takes the gateway reasoning params off `providerOptions.unknown`. `reasoning_effort` goes too:
 * left there, it would be forwarded verbatim over the mapped effort.
 */
export function takeReasoning(
  params: LanguageModelV4CallOptions,
): ChatCompletionsReasoningConfig | undefined {
  const unknown = params.providerOptions?.["unknown"];
  const reasoning = unknown?.["reasoning"] as ChatCompletionsReasoningConfig | undefined;
  if (!reasoning) return undefined;

  delete unknown!["reasoning"];
  delete unknown!["reasoning_effort"];
  return reasoning;
}

/**
 * Reasoning controls of a model, falling back to `fallback` (the lab's current generation) when
 * they are unknown, e.g. for custom models. `undefined` when the model takes none.
 */
export function reasoningControls(
  spec: ModelSpec,
  fallback: ReasoningControls,
): ReasoningControls | undefined {
  const controls = spec.reasoning ?? fallback;
  return controls && (controls.effort || controls.toggle || controls.budget) ? controls : undefined;
}

const rank = (effort: ReasoningEffortLevel) => REASONING_EFFORTS.indexOf(effort);

/** The level closest to `effort` that the model takes, ties going up. Never `none`. */
export function nearestEffort(
  effort: ReasoningEffortLevel,
  levels: readonly ReasoningEffortLevel[],
): ReasoningEffortLevel | undefined {
  const wanted = rank(effort);
  let best: ReasoningEffortLevel | undefined;
  let distance = Infinity;
  for (const level of levels) {
    if (level === "none") continue;
    const d = Math.abs(rank(level) - wanted);
    if (d < distance || (d === distance && rank(level) > wanted)) {
      best = level;
      distance = d;
    }
  }
  return best;
}

export type ResolvedReasoning = {
  /** Whether the model should reason. */
  enabled: boolean;
  /** Effort level, one the model takes (`none` included). */
  effort?: ReasoningEffortLevel;
  /** Token budget, for models that take one. */
  budget?: number;
};

/**
 * Resolves the requested reasoning to what the model takes:
 * - off: the toggle, else the `none` effort, else its lowest effort (it always reasons)
 * - on: the nearest effort it lists, and a budget (`max_tokens`, or computed from the effort)
 *   when it takes one
 *
 * `undefined` when there is nothing the model can be sent, e.g. off for a model that can't.
 */
export function resolveReasoning(
  reasoning: ChatCompletionsReasoningConfig,
  controls: ReasoningControls,
  maxOutputTokens: number = DEFAULT_MAX_OUTPUT_TOKENS,
): ResolvedReasoning | undefined {
  const { effort: levels, toggle, budget } = controls;

  if (reasoning.enabled === false || reasoning.effort === "none") {
    if (toggle) return { enabled: false };
    if (levels?.includes("none")) return { enabled: false, effort: "none" };
    return levels?.[0] ? { enabled: true, effort: levels[0] } : undefined;
  }

  const out: ResolvedReasoning = { enabled: true };
  if (reasoning.effort && levels) out.effort = nearestEffort(reasoning.effort, levels);

  if (budget && (reasoning.max_tokens || reasoning.effort)) {
    const tokens =
      reasoning.max_tokens ??
      calculateReasoningBudgetFromEffort(reasoning.effort!, maxOutputTokens, budget.min ?? 1024);
    out.budget = Math.max(
      budget.min ?? 0,
      Math.min(tokens, budget.max ?? Infinity, maxOutputTokens),
    );
  }
  return out;
}
