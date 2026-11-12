import { ProgressSteps, stepLabel, type StepNodeState } from "@/components/ui";
import { stageLabel } from "@/content/labels";
import { useT } from "@/i18n";
import type { Stage } from "@/types/api";

const NODE: Record<Stage["status"], StepNodeState> = {
  completed: "done",
  in_progress: "working",
  awaiting_human: "waiting",
  failed: "failed",
  pending: "todo",
};

/** The pipeline's steps as a numbered row; review points are marked ◆. */
export function StepTimeline({ stages }: { stages: Stage[] }) {
  const t = useT();
  const shown = stages.filter((s) => !s.undeclared);
  return (
    <ProgressSteps
      label={t.steps.listLabel}
      steps={shown.map((s) => ({
        id: s.name,
        name: stageLabel(s.name),
        state: NODE[s.status],
        status: stepLabel(s.status),
        gated: s.gated,
      }))}
    />
  );
}
