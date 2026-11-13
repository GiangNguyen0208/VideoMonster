import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Activity } from "@/components/icons";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Badge,
  Banner,
  Breadcrumb,
  Button,
  Card,
  ComingSoon,
  EmptyState,
  Spinner,
  Tabs,
  type TabItem,
} from "@/components/ui";
import { stageLabel, titleCase, videoTypeLabel } from "@/content/labels";
import { ActivityView } from "@/features/project/ActivityView";
import { boardStatus } from "@/features/project/adapters";
import { BriefView } from "@/features/project/BriefView";
import { ConceptView } from "@/features/project/ConceptView";
import { DecisionsView } from "@/features/project/DecisionsView";
import { FoundMedia } from "@/features/project/FoundMedia";
import { KickoffPanel } from "@/features/project/KickoffPanel";
import { CostPanel } from "@/features/cost/CostPanel";
import { ResultPanel } from "@/features/result/ResultPanel";
import { ReplayBar } from "@/features/project/ReplayBar";
import { stateAt } from "@/features/project/replay";
import { ScriptView } from "@/features/project/ScriptView";
import { StepTimeline } from "@/features/project/StepTimeline";
import { StoryboardView } from "@/features/project/StoryboardView";
import { NotifyButton, ReviewPanel } from "@/features/review/ReviewPanel";
import { InputsPanel } from "@/features/uploads/InputsPanel";
import { isActive, useUploads } from "@/features/uploads/uploadStore";
import { useT, type Messages } from "@/i18n";
import { useKickoff, useProject } from "@/hooks/api";
import { ApiError } from "@/services";
import type { BoardState } from "@/types/api";
import { fmtAgo, fmtMoney } from "@/utils/format";
import { ServerDown } from "@/components/layout/ServerDown";

/** Which tab shows a stage's output — used to open the tab under review. */
const STAGE_TAB: Record<string, string> = {
  research: "overview",
  idea: "overview",
  proposal: "concept",
  script: "script",
  scene_plan: "storyboard",
  assets: "storyboard",
};

export function ProjectPage() {
  const t = useT();
  const { projectId = "" } = useParams();
  const project = useProject(projectId);

  if (project.isPending) return <Spinner label={t.project.loading} />;
  if (project.isError) {
    if (project.error instanceof ApiError && project.error.status === 404) {
      return (
        <EmptyState
          title={t.project.notFoundTitle}
          action={
            <Link to="/library" className="text-accent underline">
              {t.project.backToLibrary}
            </Link>
          }
        >
          {t.project.notFoundBody(projectId)}
        </EmptyState>
      );
    }
    return <ServerDown />;
  }
  return <ProjectView state={project.data} />;
}

function ProjectView({ state: live }: { state: BoardState }) {
  const t = useT();
  const [replayAt, setReplayAt] = useState<number | null>(null);
  const replaying = replayAt !== null;
  const state = useMemo(
    () => (replayAt === null ? live : stateAt(live, replayAt)),
    [live, replayAt],
  );
  const status = boardStatus(state);
  const kickoff = useKickoff(state.project_id).data;
  const awaitingAgent = status.kind === "empty" && Boolean(kickoff);
  const uploading = useUploads(state.project_id).some(isActive);
  const tabs = buildTabs(state, t);
  const preferred = (status.stage && STAGE_TAB[status.stage]) || "storyboard";
  const [tab, setTab] = useState<string | null>(null);
  const active = tabs.some((t) => t.id === tab)
    ? tab!
    : tabs.some((t) => t.id === preferred)
      ? preferred
      : (tabs[0]?.id ?? "");
  const lastEvent = state.events.at(-1);

  return (
    <article className="space-y-6">
      <Breadcrumb
        items={[
          { label: t.app.nav.library, to: "/library" },
          { label: videoTypeLabel(state.pipeline.pipeline_type) },
          { label: state.title },
        ]}
      />
      <PageHeader
        title={state.title}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {state.live && (
              <Badge tone="success" dot pulse>
                {t.common.live}
              </Badge>
            )}
            {state.style_playbook && (
              <span>{t.project.style(titleCase(state.style_playbook))}</span>
            )}
            {state.series && <span>{t.project.series(state.series)}</span>}
            {state.cost?.total_spent_usd != null && (
              <span>{t.project.spent(fmtMoney(state.cost.total_spent_usd))}</span>
            )}
            {state.last_activity ? (
              <span>{t.project.updated(fmtAgo(state.last_activity))}</span>
            ) : null}
          </span>
        }
      />

      <Banner
        tone={status.tone}
        title={awaitingAgent ? t.project.banner.awaitingAgentTitle : status.label}
        action={status.kind === "waiting" && !replaying ? <NotifyButton /> : undefined}
      >
        {status.kind === "waiting" && t.project.banner.waiting}
        {status.kind === "stalled" && t.project.banner.stalled}
        {status.kind === "working" &&
          lastEvent?.tool &&
          t.project.banner.latest(titleCase(lastEvent.tool), lastEvent.event ?? "")}
        {status.kind === "failed" && t.project.banner.failed}
        {status.kind === "empty" && !awaitingAgent && t.project.banner.empty}
        {awaitingAgent && t.project.banner.awaitingAgent}
      </Banner>

      {awaitingAgent && uploading && <Banner tone="accent" title={t.uploads.stillUploading} />}

      {state.has_pipeline_state && (
        <Card padding="sm" className="overflow-visible">
          <section aria-labelledby="steps-h">
            <h2 id="steps-h" className="sr-only">
              {t.project.stepsHeading}
            </h2>
            <StepTimeline stages={state.stages} artifacts={state.artifacts} />
          </section>
          <div className="mt-3 border-t border-border-soft pt-3">
            <ReplayBar state={live} at={replayAt} onChange={setReplayAt} />
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          {replaying && <Banner tone="info" title={t.project.replay.banner} />}
          {!replaying && awaitingAgent && kickoff && <KickoffPanel kickoff={kickoff} />}
          {!replaying && status.kind === "working" && <RunningPanel state={state} />}
          {!replaying && status.kind === "waiting" && <ReviewPanel state={state} />}
          {!state.has_pipeline_state && (
            <FoundMedia projectId={state.project_id} snapshots={state.media.snapshots} />
          )}
          <ResultPanel projectId={state.project_id} renders={state.media.renders} />
          {tabs.length > 0 && <Tabs items={tabs} value={active} onChange={setTab} />}
        </div>
        <aside className="min-w-0 space-y-6">
          {!replaying && (
            <InputsPanel projectId={state.project_id} studioProject={Boolean(kickoff)} />
          )}
          <CostPanel projectId={state.project_id} />
        </aside>
      </div>
    </article>
  );
}

/** While the agent works: the live log, plus the render monitor the design shows (not built yet). */
function RunningPanel({ state }: { state: BoardState }) {
  const t = useT();
  const L = t.project.running;
  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <Activity className="size-4 text-info" aria-hidden />
          {L.logTitle}
        </h2>
        <ActivityView events={state.events} />
      </Card>
      <ComingSoon>
        <Card className="space-y-3">
          <h2 className="font-semibold">{L.monitor}</h2>
          <div aria-hidden className="aspect-video rounded-control bg-surface-lowest" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm">{L.pause}</Button>
            <Button size="sm">{L.cliLive}</Button>
            <Button size="sm" variant="danger">
              {L.cancel}
            </Button>
          </div>
        </Card>
      </ComingSoon>
    </div>
  );
}

function buildTabs(state: BoardState, t: Messages): TabItem[] {
  const a = state.artifacts;
  const tabs: TabItem[] = [];
  if (a.brief || a.research_brief) {
    tabs.push({
      id: "overview",
      label: a.research_brief ? stageLabel("research") : stageLabel("idea"),
      content: <BriefView brief={a.brief} research={a.research_brief} />,
    });
  }
  if (a.proposal_packet) {
    tabs.push({
      id: "concept",
      label: stageLabel("proposal"),
      content: <ConceptView proposal={a.proposal_packet} />,
    });
  }
  if (a.script) {
    tabs.push({
      id: "script",
      label: stageLabel("script"),
      content: <ScriptView script={a.script} />,
    });
  }
  tabs.push({
    id: "storyboard",
    label: stageLabel("scene_plan"),
    content: <StoryboardView projectId={state.project_id} storyboard={state.storyboard} />,
  });
  tabs.push({
    id: "decisions",
    label: t.project.tabs.decisions,
    content: <DecisionsView log={a.decision_log} />,
  });
  tabs.push({
    id: "activity",
    label: t.project.tabs.activity,
    content: <ActivityView events={state.events} />,
  });
  return tabs;
}
