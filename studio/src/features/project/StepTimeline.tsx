import { StepStatus } from "@/components/ui";
import { stageLabel } from "@/content/labels";
import { useT } from "@/i18n";
import type { Stage } from "@/lib/api";
import { cn } from "@/lib/cn";

const DOT: Record<Stage["status"], string> = {
  completed: "bg-success",
  in_progress: "bg-info animate-pulse",
  awaiting_human: "bg-accent",
  failed: "bg-danger",
  pending: "bg-surface-3",
};

/** Ordered list of steps with plain-language status and review-point markers. */
export function StepTimeline({ stages }: { stages: Stage[] }) {
  const t = useT();
  const shown = stages.filter((s) => !s.undeclared);
  return (
    <ol aria-label={t.steps.listLabel} className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {shown.map((stage, i) => (
        <li
          key={stage.name}
          className={cn(
            "flex items-start gap-3 rounded-control border px-3 py-2.5",
            stage.status === "awaiting_human"
              ? "border-accent/60 bg-accent-dim"
              : "border-border bg-surface",
          )}
        >
          <span
            aria-hidden
            className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", DOT[stage.status])}
          />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <span className="text-text-3">{i + 1}.</span>
              <span className="truncate">{stageLabel(stage.name)}</span>
              {stage.gated && (
                <span title={t.steps.reviewPoint} className="text-accent">
                  ◆<span className="sr-only">{t.steps.reviewPointShort}</span>
                </span>
              )}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <StepStatus state={stage.status} />
              {stage.stalled && (
                <span className="text-xs text-danger">
                  {t.steps.idle(stage.stalled_minutes ?? "?")}
                </span>
              )}
              {(stage.versions ?? 0) > 1 && stage.status !== "pending" && (
                <span className="text-xs text-text-3">
                  {t.steps.revised((stage.versions ?? 1) - 1)}
                </span>
              )}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
