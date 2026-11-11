import { Badge, ButtonLink, Card, ComingSoon, InfoBox, Screenplay } from "@/components/ui";
import { CheckCircle2, MessageSquareText, Volume2 } from "@/components/icons";
import { stageLabel, videoTypeLabel } from "@/content/labels";
import { asArray, asRecord, asText } from "@/features/project/adapters";
import { reviewCounts, stageUnderReview } from "@/features/review/review";
import { useT } from "@/i18n";
import { useProject } from "@/hooks/api";
import type { ProjectSummary } from "@/types/api";
import { fmtDuration } from "@/utils/format";
import { projectPath } from "@/utils/routes";

/** First section of the agent's script, as `[label, time, text]`. */
function firstScene(script: unknown) {
  const section = asRecord(asArray(asRecord(script)?.sections)[0]);
  const text = asText(section?.text);
  if (!section || !text) return null;
  const start = typeof section.start_seconds === "number" ? section.start_seconds : null;
  const end = typeof section.end_seconds === "number" ? section.end_seconds : null;
  return {
    label: asText(section.label),
    time:
      start !== null ? `${fmtDuration(start)}${end !== null ? `–${fmtDuration(end)}` : ""}` : null,
    text,
  };
}

/**
 * The one video that needs the user most: where it stands, what the agent wrote
 * and how it checked it. The decision itself is still made on the project page.
 */
export function WaitingHero({ project, count }: { project: ProjectSummary; count: number }) {
  const t = useT();
  const L = t.home.hero;
  const state = useProject(project.project_id).data;
  const stage = state ? stageUnderReview(state) : null;
  const stepName =
    stage?.name ?? project.stage_states.find((s) => s.status === "awaiting_human")?.name;
  const stepIndex = project.stage_states.findIndex((s) => s.name === stepName);
  const scene = firstScene(state?.artifacts.script);
  const selfReview = reviewCounts(stage?.review)?.summary;
  const href = projectPath(project.project_id);

  return (
    <section aria-labelledby="hero-h">
      <Card variant="active" padding="lg" className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge tone="accent" dot pulse>
            {t.home.waitingBanner(count)}
          </Badge>
          <p className="text-xs text-text-3">
            {L.projectId}{" "}
            <code className="rounded bg-surface-high px-2 py-1 font-mono text-text-2">
              {project.project_id}
            </code>
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <div className="min-w-0 space-y-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="hero-h" className="text-2xl font-semibold tracking-tight">
                  {project.title}
                </h2>
                <Badge size="sm">{videoTypeLabel(project.pipeline_type)}</Badge>
              </div>
              {stepName && (
                <p className="mt-1 text-text-2">
                  {L.step(stepIndex + 1, project.stage_states.length, stageLabel(stepName))}
                </p>
              )}
            </div>
            {scene && (
              <Screenplay title={scene.label ?? undefined} meta={scene.time ?? undefined}>
                <p className="line-clamp-4 whitespace-pre-line">{scene.text}</p>
              </Screenplay>
            )}
            {selfReview && (
              <InfoBox icon={<CheckCircle2 className="size-4" />}>
                <strong className="font-semibold text-text">{L.selfReview}</strong> {selfReview}
              </InfoBox>
            )}
          </div>

          <Card padding="md" className="space-y-3 self-start">
            <h3 className="text-xs font-semibold tracking-wider text-text-3 uppercase">
              {L.quickActions}
            </h3>
            <ComingSoon>
              <div className="flex items-center gap-2 rounded-control border border-border bg-surface-low px-3 py-2.5 text-sm">
                <Volume2 aria-hidden className="size-4 text-text-3" />
                <span className="flex-1">{L.voicePreview}</span>
                <span className="font-mono text-xs text-text-3">—</span>
              </div>
            </ComingSoon>
            <ButtonLink
              to={href}
              variant="primary"
              size="lg"
              className="w-full"
              leftIcon={<CheckCircle2 className="size-4" />}
            >
              {L.approve}
            </ButtonLink>
            <ButtonLink
              to={href}
              variant="secondary"
              className="w-full"
              leftIcon={<MessageSquareText className="size-4" />}
            >
              {L.requestChanges}
            </ButtonLink>
            <p className="text-center text-xs text-text-3">{L.handoff}</p>
          </Card>
        </div>
      </Card>
    </section>
  );
}
