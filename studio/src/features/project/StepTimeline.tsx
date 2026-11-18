import { useState } from "react";
import { ProgressSteps, stepLabel, type StepNodeState } from "@/components/ui";
import { stageLabel } from "@/content/labels";
import { useT } from "@/i18n";
import type { ArtifactMap, Stage } from "@/types/api";
import { StageDrawer } from "./StageDrawer";

const NODE: Record<Stage["status"], StepNodeState> = {
  completed: "done",
  in_progress: "working",
  awaiting_human: "waiting",
  failed: "failed",
  pending: "todo",
};

/** The pipeline's steps as a numbered row; review points are marked ◆. */
export function StepTimeline({ stages, artifacts }: { stages: Stage[]; artifacts: ArtifactMap }) {
  const t = useT();
  const [selected, setSelected] = useState<string | null>(null);
  const shown = stages.filter((s) => !s.undeclared);
  return (
    <>
      <ProgressSteps
        label={t.steps.listLabel}
        onSelect={setSelected}
        steps={shown.map((s) => ({
          id: s.name,
          name: stageLabel(s.name),
          state: NODE[s.status],
          status: stepLabel(s.status),
          gated: s.gated,
        }))}
      />
      <StageDrawer
        stage={shown.find((s) => s.name === selected) ?? null}
        artifacts={artifacts}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
