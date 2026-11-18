import { useEffect, useId, useRef, useState } from "react";
import {
  Banner,
  Button,
  Card,
  CodeBox,
  Collapsible,
  controlClass,
  Dialog,
  ErrorText,
  InfoBox,
  Spinner,
} from "@/components/ui";
import { stageLabel } from "@/content/labels";
import { asArray, asRecord, asText } from "@/features/project/adapters";
import { useT } from "@/i18n";
import { useDecisions, useRetractDecision, useSetup, useSubmitDecision } from "@/hooks/api";
import type { BoardState, DecisionAction, Stage, StudioDecision } from "@/types/api";
import { errorText } from "@/utils/errors";
import { fmtMoney } from "@/utils/format";
import { ArtifactSummaries } from "./ArtifactSummaries";
import { stageArtifactSummaries } from "./artifacts";
import { ProposalPicker } from "./ProposalPicker";
import { ReferenceInsights } from "./ReferenceInsights";
import {
  answeredEarlierVersion,
  decisionFor,
  initialPicks,
  toProposal,
  type Picks,
  proposalDefaults,
  referenceInsights,
  reviewCounts,
  runtimeRationale,
  stageUnderReview,
} from "./review";

/**
 * Review point in the browser. Studio only records the user's decision
 * (studio/decisions/*.json); the agent waiting at the gate applies it.
 */
export function ReviewPanel({ state }: { state: BoardState }) {
  const stage = stageUnderReview(state);
  const decisions = useDecisions(state.project_id).data ?? [];
  useReviewNotification(state.title, stage);
  if (!stage) return null;

  const decision = decisionFor(decisions, stage);
  if (decision?.state === "pending") {
    return <SentCard projectId={state.project_id} decision={decision} />;
  }
  if (decision?.state === "consumed") return <ApplyingCard />;
  return (
    <ReviewForm
      key={`${stage.name}:${stage.timestamp}`}
      state={state}
      stage={stage}
      revisedSinceAnswer={answeredEarlierVersion(decisions, stage)}
    />
  );
}

const EARLY_STAGES = new Set(["research", "idea", "proposal"]);

function ReviewForm({
  state,
  stage,
  revisedSinceAnswer,
}: {
  state: BoardState;
  stage: Stage;
  revisedSinceAnswer: boolean;
}) {
  const t = useT();
  const L = t.review;
  const notesId = useId();
  const submit = useSubmitDecision(state.project_id);
  const runtimes = useSetup().view?.runtimes ?? null;
  const [revising, setRevising] = useState(false);
  const [notes, setNotes] = useState("");
  const [confirmStop, setConfirmStop] = useState(false);
  const [sectionNotes, setSectionNotes] = useState<Record<string, string>>({});

  const proposal =
    stage.name === "proposal" ? proposalDefaults(state.artifacts.proposal_packet) : null;
  const [chosen, setPicks] = useState<Picks | null>(() =>
    proposal ? initialPicks(proposal, runtimes) : null,
  );
  // Machine capabilities may load after the panel: never keep a pick the
  // machine can't render.
  const picks =
    chosen && proposal && runtimes && chosen.runtime && runtimes[chosen.runtime] === false
      ? { ...chosen, runtime: initialPicks(proposal, runtimes).runtime }
      : chosen;
  const sections =
    stage.name === "script"
      ? asArray(asRecord(state.artifacts.script)?.sections)
          .map(asRecord)
          .filter((s): s is Record<string, unknown> => Boolean(s))
          .map((s, i) => ({
            id: asText(s.id) ?? String(i),
            label: asText(s.label) ?? t.project.script.section(i + 1),
          }))
      : [];

  const counts = reviewCounts(stage.review);
  // Reference projects: what the agent took from the video, at the early
  // review points where the direction is still being decided.
  const insights = EARLY_STAGES.has(stage.name)
    ? referenceInsights(state.artifacts.video_analysis_brief)
    : null;
  const spent = state.cost?.total_spent_usd;
  const step = stageLabel(stage.name);
  const summaries = stageArtifactSummaries(stage, state.artifacts);

  const allNotes = () =>
    [
      notes.trim(),
      ...sections
        .filter((s) => sectionNotes[s.id]?.trim())
        .map((s) => L.sectionNote(s.label, sectionNotes[s.id]!.trim())),
    ]
      .filter(Boolean)
      .join("\n");

  const send = (action: DecisionAction) =>
    submit.mutate({
      stage: stage.name,
      checkpoint_timestamp: stage.timestamp!,
      action,
      notes: action === "abort" ? notes.trim() : allNotes(),
      proposal: action === "approve" && picks ? toProposal(picks) : null,
    });

  const error = errorText(submit.error, L.errors);

  return (
    <Card className="space-y-6 border-accent/50" aria-labelledby="review-h" role="region">
      <div className="space-y-1">
        <h2 id="review-h" className="text-lg font-semibold">
          {L.heading(step)}
        </h2>
        <p className="text-sm text-text-2">{L.intro}</p>
      </div>

      {revisedSinceAnswer && <Banner tone="info" title={L.stale} />}

      {(counts || spent != null) && (
        <InfoBox className="space-y-1">
          {counts && (
            <p>
              <span className="font-medium">{L.selfReview}:</span>{" "}
              {counts.summary && <span className="text-text-2">{counts.summary} </span>}
              <span className="text-text-3">
                ({L.counts(counts.critical, counts.suggestions, counts.nitpicks)})
              </span>
            </p>
          )}
          {spent != null && <p className="text-text-3">{L.costSoFar(fmtMoney(spent))}</p>}
        </InfoBox>
      )}

      {insights && <ReferenceInsights insights={insights} />}

      {proposal && picks ? (
        <ProposalPicker
          defaults={proposal}
          picks={picks}
          onChange={setPicks}
          available={runtimes}
          rationale={runtimeRationale(state.artifacts.decision_log)}
        />
      ) : (
        stage.name !== "script" &&
        (summaries.length > 0 ? (
          <ArtifactSummaries summaries={summaries} />
        ) : (
          <p className="text-sm text-text-2">{L.seeBelow(step)}</p>
        ))
      )}

      {sections.length > 0 && (
        <Collapsible label={L.sectionComments}>
          <div className="space-y-3">
            {sections.map((s) => (
              <label key={s.id} className="block space-y-1 text-sm">
                <span className="text-text-2">{L.sectionComment(s.label)}</span>
                <textarea
                  rows={2}
                  value={sectionNotes[s.id] ?? ""}
                  onChange={(e) => setSectionNotes({ ...sectionNotes, [s.id]: e.target.value })}
                  className={controlClass}
                />
              </label>
            ))}
          </div>
        </Collapsible>
      )}

      {revising && (
        <div className="space-y-1.5">
          <label htmlFor={notesId} className="block text-sm font-medium">
            {L.notesLabel}
          </label>
          <textarea
            id={notesId}
            rows={4}
            autoFocus
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={controlClass}
          />
          <p className="text-xs text-text-3">{L.notesHint}</p>
        </div>
      )}

      {error && <ErrorText>{error}</ErrorText>}

      <div className="flex flex-wrap items-center gap-2">
        {revising ? (
          <>
            <Button
              variant="primary"
              disabled={submit.isPending || !allNotes()}
              onClick={() => send("revise")}
            >
              {submit.isPending ? L.sending : L.sendChanges}
            </Button>
            <Button variant="ghost" onClick={() => setRevising(false)}>
              {L.cancel}
            </Button>
          </>
        ) : (
          <>
            <Button variant="primary" disabled={submit.isPending} onClick={() => send("approve")}>
              {submit.isPending ? L.sending : L.approve}
            </Button>
            <Button onClick={() => setRevising(true)} disabled={submit.isPending}>
              {L.requestChanges}
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          className="ml-auto text-danger"
          onClick={() => setConfirmStop(true)}
          disabled={submit.isPending}
        >
          {L.stop}
        </Button>
      </div>

      <Dialog
        open={confirmStop}
        onClose={() => setConfirmStop(false)}
        title={L.stopTitle}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmStop(false)}>
              {L.cancel}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmStop(false);
                send("abort");
              }}
            >
              {L.stop}
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-2">{L.stopBody}</p>
      </Dialog>
    </Card>
  );
}

function SentCard({ projectId, decision }: { projectId: string; decision: StudioDecision }) {
  const t = useT();
  const L = t.review;
  const retract = useRetractDecision(projectId);
  return (
    <Card variant="active" className="space-y-3" role="status">
      <p className="font-medium">{L.sent[decision.action] ?? decision.action}</p>
      <p className="text-sm text-text-2">{L.waitingAgent}</p>
      <CodeBox
        code={`claude "/studio-continue ${projectId}"`}
        copyLabel={t.project.kickoff.copyCommand("Claude Code")}
      />
      <Button size="sm" variant="ghost" onClick={() => retract.mutate(decision.id)}>
        {L.retract}
      </Button>
    </Card>
  );
}

function ApplyingCard() {
  const t = useT();
  return (
    <Card className="flex items-center gap-3" role="status">
      <Spinner label={t.review.applying} />
      <p className="text-sm">{t.review.applying}</p>
    </Card>
  );
}

/** Ask for notification permission once; notify when a new review point
 * appears while the tab is in the background. */
function useReviewNotification(title: string, stage: Stage | null) {
  const t = useT();
  const seen = useRef<string | null>(null);
  const key = stage ? `${stage.name}:${stage.timestamp}` : null;
  useEffect(() => {
    if (!key || seen.current === key) return;
    const first = seen.current === null;
    seen.current = key;
    if (first || typeof Notification === "undefined") return;
    if (Notification.permission === "granted" && document.hidden) {
      new Notification(t.review.notifyTitle(title), { body: stageLabel(stage!.name) });
    }
  }, [key, stage, t, title]);
}

export function NotifyButton() {
  const t = useT();
  const [permission, setPermission] = useState(() =>
    typeof Notification === "undefined" ? "denied" : Notification.permission,
  );
  if (permission !== "default") return null;
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => void Notification.requestPermission().then(setPermission)}
    >
      {t.review.notify}
    </Button>
  );
}
