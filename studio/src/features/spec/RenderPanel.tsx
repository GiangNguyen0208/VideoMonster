import { Badge, Banner, Button, Card, ErrorText, ProgressBar, Spinner } from "@/components/ui";
import { useT } from "@/i18n";
import { useRenderView, useStartRender } from "@/hooks/api";
import type { SpecFlow, WorkerJob } from "@/types/api";
import { errorText } from "@/utils/errors";
import { fmtMoney } from "@/utils/format";

const TONE: Record<string, "success" | "danger" | "info" | "neutral"> = {
  passed: "success",
  failed: "danger",
  needs_replan: "danger",
  blocked_budget: "danger",
  skipped_dependency: "neutral",
  running: "info",
};

/** Step 3: the Gemini worker. Studio starts it; nothing here calls an LLM. */
export function RenderPanel({ projectId, flow }: { projectId: string; flow: SpecFlow }) {
  const t = useT();
  const L = t.spec.render;
  const view = useRenderView(projectId, true);
  const start = useStartRender(projectId);

  if (view.isPending) return <Spinner label={L.loading} />;
  if (view.isError || !view.data) return <ErrorText>{L.loadFailed}</ErrorText>;
  const { state, job, report, render_report, run } = view.data;
  const live = job?.output;
  const progress = live ? live.done / Math.max(live.total, 1) : (job?.progress ?? 0);
  const failedJobs = (report?.jobs ?? []).filter((j) => j.status !== "passed");
  const canStart =
    (state === "ready" || state === "partial" || state === "failed") && flow.gemini_key;

  return (
    <Card className="space-y-5">
      <header>
        <h2 className="text-lg font-semibold">{L.title}</h2>
        <p className="mt-1 text-sm text-text-2">{L.intro}</p>
      </header>
      {state === "locked" && <p className="text-sm text-text-3">{L.locked}</p>}
      {!flow.gemini_key && state !== "locked" && (
        <Banner tone="danger" title={L.keyMissingTitle}>
          {L.keyMissing}
        </Banner>
      )}
      {state === "running" && (
        <div className="space-y-2">
          <ProgressBar value={progress} label={L.progress(live?.done ?? 0, live?.total ?? 0)} />
          <p className="text-sm text-text-2">{L.progress(live?.done ?? 0, live?.total ?? 0)}</p>
        </div>
      )}
      {(live || report) && <JobChips live={live?.jobs ?? {}} report={report?.jobs ?? []} />}
      {state === "failed" && run?.error && <ErrorText>{run.error}</ErrorText>}
      {state === "partial" && failedJobs.length > 0 && (
        <Banner tone="danger" title={L.partialTitle}>
          <ul className="list-disc pl-5 text-sm">
            {failedJobs.map((j) => (
              <li key={j.job_id}>
                {j.job_id}: {j.reasons?.[0] ?? j.status}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm">{L.partialBody}</p>
        </Banner>
      )}
      {report && <p className="text-sm text-text-2">{L.spent(fmtMoney(report.total_cost_usd))}</p>}
      {render_report?.warnings.map((w) => (
        <p key={w} className="text-xs text-text-3">
          {w}
        </p>
      ))}
      {state === "complete" && render_report?.metadata.final_check === "failed" && (
        <Banner tone="danger" title={L.finalFailed} />
      )}
      {canStart && (
        <Button variant="primary" disabled={start.isPending} onClick={() => start.mutate()}>
          {state === "ready" ? L.start : L.retry}
        </Button>
      )}
      {start.error ? <ErrorText>{errorText(start.error, t.spec.errors)}</ErrorText> : null}
    </Card>
  );
}

function JobChips({ live, report }: { live: Record<string, string>; report: WorkerJob[] }) {
  const L = useT().spec.render;
  const ids = [...new Set([...report.map((j) => j.job_id), ...Object.keys(live)])];
  return (
    <ul className="flex flex-wrap gap-2" aria-label={L.jobs}>
      {ids.map((id) => {
        const status = live[id] ?? report.find((j) => j.job_id === id)?.status ?? "pending";
        const attempts = report.find((j) => j.job_id === id)?.attempts.length ?? 0;
        return (
          <li key={id}>
            <Badge tone={TONE[status] ?? "neutral"}>
              {id} · {L.status[status] ?? status}
              {attempts > 1 ? ` ×${attempts}` : ""}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}
