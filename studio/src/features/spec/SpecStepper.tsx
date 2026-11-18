import { Check } from "@/components/icons";
import { useT } from "@/i18n";
import type { SpecFlow } from "@/types/api";
import { cn } from "@/utils/cn";

const DONE = new Set(["approved", "complete", "delivered"]);

/** Requirements → Spec → Render → Result, as derived from the project's files. */
export function SpecStepper({ flow }: { flow: SpecFlow }) {
  const L = useT().spec.stepper;
  return (
    <ol aria-label={L.label} className="flex flex-wrap gap-2">
      {flow.steps.map((step, i) => {
        const done = DONE.has(step.state);
        const current = flow.current === step.id && !done;
        const locked = step.state === "locked";
        return (
          <li
            key={step.id}
            aria-current={current ? "step" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-control border px-3 py-1.5 text-sm",
              done && "border-success/40 bg-success-dim text-success",
              current && "border-accent bg-accent-dim text-accent",
              !done && !current && "border-border bg-surface-high text-text-3",
            )}
          >
            <span className="flex size-5 items-center justify-center rounded-full border border-current text-xs">
              {done ? <Check className="size-3" aria-hidden /> : i + 1}
            </span>
            <span className="font-medium">{L.steps[step.id]}</span>
            <span className={cn("text-xs", locked ? "opacity-70" : "opacity-90")}>
              {L.states[step.state] ?? step.state}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
