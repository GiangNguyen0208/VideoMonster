import { Badge, Banner, Card, Collapsible, ErrorText, Spinner } from "@/components/ui";
import { useT } from "@/i18n";
import { useDecisions, useSpecDecision, useSpecView } from "@/hooks/api";
import type { SpecFlow } from "@/types/api";
import { fmtMoney } from "@/utils/format";
import { GateActions } from "./GateActions";
import { jobCounts, jobPrompt, jobsOfScene, pendingDecision, sectionText } from "./spec";

/** Gate 2 (and 2′ after a recovery edit): the whole plan the worker will follow. */
export function SpecPanel({ projectId, flow }: { projectId: string; flow: SpecFlow }) {
  const t = useT();
  const L = t.spec.spec;
  const view = useSpecView(projectId, true);
  const decisions = useDecisions(projectId).data ?? [];
  const decide = useSpecDecision(projectId, "spec");

  if (view.isPending) return <Spinner label={L.loading} />;
  if (view.isError || !view.data) return <ErrorText>{L.loadFailed}</ErrorText>;
  const { spec, sealed, approved, errors, token, changes } = view.data;
  const stage = changes.length > 0 ? "spec_recovery" : "spec";
  const open = Boolean(token) && flow.gate?.token === token && !approved;
  const total =
    spec.estimated_total_cost_usd ?? spec.jobs.reduce((s, j) => s + j.estimated_cost_usd, 0);
  const counts = jobCounts(spec);
  const send = (action: "approve" | "revise" | "abort", notes = "") =>
    decide.mutate({ action, token: token ?? "", notes });

  return (
    <Card className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold">{changes.length > 0 ? L.recoveryTitle : L.title}</h2>
        <p className="mt-1 text-sm text-text-2">{changes.length > 0 ? L.recoveryIntro : L.intro}</p>
      </header>
      {!sealed && (
        <Banner tone="danger" title={L.notSealed}>
          <ul className="list-disc pl-5 text-sm">
            {errors.slice(0, 5).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Banner>
      )}
      <div className="flex flex-wrap gap-2 text-sm">
        <Badge>{L.facts(spec.duration_seconds, spec.aspect_ratio)}</Badge>
        <Badge tone="accent">{L.cost(fmtMoney(total))}</Badge>
        {Object.entries(counts).map(([kind, n]) => (
          <Badge key={kind}>{L.jobKind(kind, n)}</Badge>
        ))}
      </div>
      <p className="text-sm text-text-2">{spec.style_summary}</p>
      {changes.length > 0 && (
        <section aria-labelledby="spec-changes" className="space-y-2">
          <h3 id="spec-changes" className="font-semibold">
            {L.changes}
          </h3>
          {changes.map((c) => (
            <div key={c.job_id} className="rounded-control border border-border p-3 text-sm">
              <p className="font-medium">{c.job_id}</p>
              <p className="text-xs text-text-3">{L.before}</p>
              <p className="whitespace-pre-wrap">{JSON.stringify(c.old?.params ?? {}, null, 1)}</p>
              <p className="mt-2 text-xs text-text-3">{L.after}</p>
              <p className="whitespace-pre-wrap">{JSON.stringify(c.new.params, null, 1)}</p>
            </div>
          ))}
        </section>
      )}
      <section aria-labelledby="spec-scenes" className="space-y-3">
        <h3 id="spec-scenes" className="font-semibold">
          {L.scenes}
        </h3>
        {spec.scenes.map((scene) => (
          <div
            key={scene.id}
            className="space-y-1 rounded-control border border-border p-3 text-sm"
          >
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{L.scene(scene.id)}</span>
              <span className="text-xs text-text-3">
                {scene.start_seconds}–{scene.end_seconds}s
              </span>
              {scene.serves.map((g) => (
                <Badge key={g} tone="info">
                  {g}
                </Badge>
              ))}
            </p>
            <p className="text-text-2">{scene.description}</p>
            <p className="italic">“{sectionText(spec, scene.script_section_id)}”</p>
            <Collapsible label={L.jobs(jobsOfScene(spec, scene.id).length)}>
              <ul className="space-y-2 text-xs">
                {jobsOfScene(spec, scene.id).map((j) => (
                  <li key={j.job_id}>
                    <span className="font-medium">
                      {j.job_id} · {j.tool} · {fmtMoney(j.estimated_cost_usd)}
                    </span>
                    <span className="block text-text-2">{jobPrompt(j)}</span>
                  </li>
                ))}
              </ul>
            </Collapsible>
          </div>
        ))}
      </section>
      {approved ? (
        <Banner tone="success" title={L.approved} />
      ) : open ? (
        <GateActions
          projectId={projectId}
          pending={pendingDecision(decisions, stage)}
          approveLabel={L.approve(fmtMoney(total))}
          busy={decide.isPending}
          error={decide.error}
          onApprove={() => send("approve")}
          onRevise={(n) => send("revise", n)}
          onAbort={() => send("abort")}
        />
      ) : (
        <p className="text-sm text-text-3">{L.notOpen}</p>
      )}
    </Card>
  );
}
