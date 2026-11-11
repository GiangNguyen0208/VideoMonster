import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import { Check } from "@/components/icons";

export type StepNodeState = "done" | "current" | "waiting" | "working" | "failed" | "todo";

const NODE: Record<StepNodeState, string> = {
  done: "border-success bg-success text-on-accent",
  current: "border-accent bg-accent text-on-accent ring-4 ring-accent/20",
  waiting: "border-accent bg-accent text-on-accent ring-4 ring-accent/20 motion-safe:animate-pulse",
  working: "border-info bg-info text-on-accent ring-4 ring-info/20 motion-safe:animate-pulse",
  failed: "border-danger bg-danger text-on-accent",
  todo: "border-border bg-surface-highest text-text-3",
};

/**
 * Horizontal row of numbered step nodes joined by a line (project timeline).
 * Each step still carries its state as text (`status`) for screen readers.
 */
export function ProgressSteps({
  label,
  steps,
  className,
}: {
  label: string;
  steps: { id: string; name: ReactNode; state: StepNodeState; status: string; gated?: boolean }[];
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto py-1", className)}>
      <ol aria-label={label} className="flex min-w-[640px] items-start">
        {steps.map((s, i) => (
          <li key={s.id} className="relative flex flex-1 flex-col items-center text-center">
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  "absolute top-4 left-1/2 h-0.5 w-full",
                  s.state === "done" ? "bg-success/60" : "bg-border",
                )}
              />
            )}
            <span
              aria-hidden
              className={cn(
                "relative z-10 grid size-8 place-items-center rounded-full border text-xs font-semibold",
                NODE[s.state],
              )}
            >
              {s.state === "done" ? <Check className="size-4" strokeWidth={3} /> : i + 1}
            </span>
            <span
              className={cn(
                "mt-2 px-1 text-xs font-medium",
                s.state === "waiting" || s.state === "current"
                  ? "text-accent"
                  : s.state === "todo"
                    ? "text-text-3"
                    : "text-text",
              )}
            >
              {s.name}
            </span>
            <span className="px-1 text-[11px] text-text-2">{s.status}</span>
            {s.gated && (
              <span aria-hidden className="mt-0.5 text-[10px] text-accent/80">
                ◆
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Wizard step cards ("1 · Goal — done", "2 · Brief — now"). */
export function Stepper({
  label,
  steps,
  current,
  className,
}: {
  label: string;
  steps: { key: string; title: ReactNode; sub?: ReactNode }[];
  current: number;
  className?: string;
}) {
  return (
    <ol aria-label={label} className={cn("grid gap-2 sm:auto-cols-fr sm:grid-flow-col", className)}>
      {steps.map((s, i) => {
        const state = i < current ? "done" : i === current ? "current" : "todo";
        return (
          <li
            key={s.key}
            aria-current={state === "current" ? "step" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-card border px-3 py-2.5",
              state === "current"
                ? "border-accent bg-accent-dim shadow-glow"
                : state === "done"
                  ? "border-success/40 bg-surface"
                  : "border-border-soft bg-surface-lowest",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold",
                state === "current"
                  ? "border-accent bg-accent text-on-accent"
                  : state === "done"
                    ? "border-success/50 text-success"
                    : "border-border text-text-3",
              )}
            >
              {state === "done" ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
            </span>
            <span className="min-w-0">
              <span
                className={cn(
                  "block truncate text-sm font-medium",
                  state === "todo" ? "text-text-3" : "text-text",
                )}
              >
                {i + 1}. {s.title}
              </span>
              {s.sub && <span className="block truncate text-xs text-text-2">{s.sub}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
