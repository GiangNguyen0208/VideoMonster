import { msg } from "@/i18n";
import type { Tone } from "./Badge";

/** Checkpoint statuses (schemas/checkpoints/checkpoint.schema.json) + "pending". */
export type StepState = "completed" | "in_progress" | "awaiting_human" | "failed" | "pending";

export const STEP_TONES: Record<StepState, Tone> = {
  completed: "success",
  in_progress: "info",
  awaiting_human: "accent",
  failed: "danger",
  pending: "neutral",
};

/** Plain-language label — Studio never shows raw engine statuses. */
export function stepLabel(state: StepState): string {
  return msg().steps.state[state];
}
