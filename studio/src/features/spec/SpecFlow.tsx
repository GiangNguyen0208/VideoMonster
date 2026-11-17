import { Banner } from "@/components/ui";
import { useT } from "@/i18n";
import { useSpecFlow } from "@/hooks/api";
import type { SpecStepId } from "@/types/api";
import { useState } from "react";
import type { BoardState } from "@/types/api";
import { RenderPanel } from "./RenderPanel";
import { RequirementsPanel } from "./RequirementsPanel";
import { SpecPanel } from "./SpecPanel";
import { SpecStepper } from "./SpecStepper";
import { stateOf } from "./spec";

/**
 * Spec-mode project view: stepper plus the panel of the step in focus.
 * Later steps are only reachable once the earlier one is approved.
 */
export function SpecFlow({ state }: { state: BoardState }) {
  const t = useT();
  const projectId = state.project_id;
  const flow = useSpecFlow(projectId).data;
  const [picked, setPicked] = useState<SpecStepId | null>(null);
  if (!flow) return null;

  const reachable = (id: SpecStepId) =>
    stateOf(flow.steps, id) !== "locked" && stateOf(flow.steps, id) !== "missing";
  const focus = picked && reachable(picked) ? picked : flow.current;
  const L = t.spec;

  return (
    <div className="space-y-4">
      <SpecStepper flow={flow} />
      <nav aria-label={L.stepper.label} className="flex flex-wrap gap-2 text-xs">
        {flow.steps
          .filter((s) => reachable(s.id))
          .map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setPicked(s.id)}
              aria-pressed={focus === s.id}
              className="rounded-control border border-border px-2 py-1 text-text-2 aria-pressed:border-accent aria-pressed:text-accent"
            >
              {L.stepper.steps[s.id]}
            </button>
          ))}
      </nav>
      {focus === "requirements" && stateOf(flow.steps, "requirements") === "missing" && (
        <Banner tone="info" title={L.waitingAgent.title}>
          {L.waitingAgent.body}
        </Banner>
      )}
      {focus === "requirements" && stateOf(flow.steps, "requirements") !== "missing" && (
        <RequirementsPanel projectId={projectId} flow={flow} />
      )}
      {focus === "spec" &&
        (stateOf(flow.steps, "spec") === "missing" ? (
          <Banner tone="info" title={L.waitingAgent.specTitle}>
            {L.waitingAgent.specBody}
          </Banner>
        ) : (
          <SpecPanel projectId={projectId} flow={flow} />
        ))}
      {focus === "render" && <RenderPanel projectId={projectId} flow={flow} />}
      {focus === "result" && (
        <Banner
          tone={stateOf(flow.steps, "result") === "delivered" ? "success" : "neutral"}
          title={L.result.title}
        >
          {stateOf(flow.steps, "result") === "delivered" ? L.result.done : L.result.pending}
        </Banner>
      )}
    </div>
  );
}
