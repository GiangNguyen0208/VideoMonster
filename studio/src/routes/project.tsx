import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge, Banner, EmptyState, Spinner, Tabs, type TabItem } from "@/components/ui";
import { stageLabel, titleCase, videoTypeLabel } from "@/content/labels";
import { ActivityView } from "@/features/project/ActivityView";
import { boardStatus } from "@/features/project/adapters";
import { BriefView } from "@/features/project/BriefView";
import { ConceptView } from "@/features/project/ConceptView";
import { DecisionsView } from "@/features/project/DecisionsView";
import { KickoffPanel } from "@/features/project/KickoffPanel";
import { CostPanel } from "@/features/cost/CostPanel";
import { ResultPanel } from "@/features/result/ResultPanel";
import { ScriptView } from "@/features/project/ScriptView";
import { StepTimeline } from "@/features/project/StepTimeline";
import { StoryboardView } from "@/features/project/StoryboardView";
import { NotifyButton, ReviewPanel } from "@/features/review/ReviewPanel";
import { InputsPanel } from "@/features/uploads/InputsPanel";
import { isActive, useUploads } from "@/features/uploads/uploadStore";
import { useT, type Messages } from "@/i18n";
import { ApiError, useKickoff, useProject, type BoardState } from "@/lib/api";
import { fmtAgo, fmtMoney } from "@/lib/format";
import { ServerDown } from "./ServerDown";

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

function ProjectView({ state }: { state: BoardState }) {
  const t = useT();
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
    <article className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-text-3">
            <Link to="/library" className="hover:text-text">
              {t.app.nav.library}
            </Link>{" "}
            / {videoTypeLabel(state.pipeline.pipeline_type)}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{state.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-text-2">
            {state.live && <Badge tone="success">{t.common.live}</Badge>}
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
          </p>
        </div>
        <a
          href={`/p/${encodeURIComponent(state.project_id)}`}
          className="text-sm text-text-2 underline hover:text-text"
        >
          {t.app.openClassicBoard}
        </a>
      </header>

      <Banner
        tone={status.tone}
        title={awaitingAgent ? t.project.banner.awaitingAgentTitle : status.label}
        action={status.kind === "waiting" ? <NotifyButton /> : undefined}
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

      {awaitingAgent && kickoff && <KickoffPanel kickoff={kickoff} />}

      <InputsPanel projectId={state.project_id} studioProject={Boolean(kickoff)} />

      {status.kind === "waiting" && <ReviewPanel state={state} />}

      {state.has_pipeline_state && (
        <section aria-labelledby="steps-h" className="space-y-3">
          <h2 id="steps-h" className="text-lg font-semibold">
            {t.project.stepsHeading}
          </h2>
          <StepTimeline stages={state.stages} />
        </section>
      )}

      <ResultPanel projectId={state.project_id} renders={state.media.renders} />

      <CostPanel projectId={state.project_id} />

      {tabs.length > 0 && <Tabs items={tabs} value={active} onChange={setTab} />}
    </article>
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
