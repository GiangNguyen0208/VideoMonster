import { Badge, Drawer, Eyebrow, STEP_TONES, stepLabel } from "@/components/ui";
import { stageLabel } from "@/content/labels";
import { ArtifactSummaries } from "@/features/review/ArtifactSummaries";
import { stageArtifactSummaries } from "@/features/review/artifacts";
import { reviewCounts } from "@/features/review/review";
import { useT } from "@/i18n";
import type { ArtifactMap, Stage } from "@/types/api";
import { fmtClock } from "@/utils/format";

/** Everything known about one pipeline step: versions, history, what it made. */
export function StageDrawer({
  stage,
  artifacts,
  onClose,
}: {
  stage: Stage | null;
  artifacts: ArtifactMap;
  onClose: () => void;
}) {
  const t = useT();
  const L = t.project.drawer;
  const open = stage !== null;
  const name = stage ? stageLabel(stage.name) : "";
  const counts = stage ? reviewCounts(stage.review) : null;
  const summaries = stage ? stageArtifactSummaries(stage, artifacts, true) : [];
  const history = stage?.history_entries ?? [];

  return (
    <Drawer open={open} onClose={onClose} title={L.title(name)}>
      {stage && (
        <div className="space-y-5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STEP_TONES[stage.status]}>{stepLabel(stage.status)}</Badge>
            {stage.versions ? <Badge>{L.versions(stage.versions)}</Badge> : null}
            <span className="text-text-2">
              {!stage.gated
                ? L.noReview
                : stage.gate_skipped
                  ? L.gateSkipped
                  : stage.human_approved
                    ? L.gateApproved
                    : L.gate}
            </span>
          </div>

          {counts && (
            <p className="text-text-2">
              {counts.summary && <span>{counts.summary} </span>}
              <span className="text-text-3">
                ({t.review.counts(counts.critical, counts.suggestions, counts.nitpicks)})
              </span>
            </p>
          )}

          <section aria-label={L.history} className="space-y-2">
            <Eyebrow as="h3">{L.history}</Eyebrow>
            {history.length ? (
              <ol className="space-y-1">
                {history.map((h, i) => (
                  <li key={i} className="flex items-baseline gap-3">
                    <span className="w-20 shrink-0 font-mono text-xs text-text-3">
                      {fmtClock(h.timestamp)}
                    </span>
                    <span className="text-text-2">
                      {h.status && h.status in STEP_TONES
                        ? stepLabel(h.status as Stage["status"])
                        : (h.status ?? "—")}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-text-3">{L.noHistory}</p>
            )}
          </section>

          <section aria-label={L.artifacts} className="space-y-2">
            <Eyebrow as="h3">{L.artifacts}</Eyebrow>
            {summaries.length ? (
              <ArtifactSummaries summaries={summaries} />
            ) : (
              <p className="text-text-3">{L.noArtifacts}</p>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}
