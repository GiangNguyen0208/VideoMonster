/**
 * Pure mappings from Backlot state to what Studio shows. Keep all engine
 * vocabulary here so pages only deal in plain-language view models.
 */
import type { Tone } from "@/components/ui";
import { stageLabel, titleCase } from "@/content/labels";
import { msg } from "@/i18n";
import type { BoardState, Decision, ProjectSummary, StageState, ToolEvent } from "@/types/api";
import { fmtMoney } from "@/utils/format";

export type StatusKind = "waiting" | "failed" | "stalled" | "working" | "done" | "paused" | "empty";

export interface ProjectStatus {
  kind: StatusKind;
  label: string;
  tone: Tone;
  /** Stage the status is about (the one waiting, failing or running). */
  stage: string | null;
}

interface StatusInput {
  stages: StageState[];
  hasPipelineState: boolean;
  renderCount: number;
  stalled: boolean;
}

export function deriveStatus({
  stages,
  hasPipelineState,
  renderCount,
  stalled,
}: StatusInput): ProjectStatus {
  const declared = stages;
  const t = msg().status;
  const find = (status: StageState["status"]) => declared.find((s) => s.status === status);

  const waiting = find("awaiting_human");
  if (waiting) {
    return {
      kind: "waiting",
      label: t.waiting(stageLabel(waiting.name)),
      tone: "accent",
      stage: waiting.name,
    };
  }
  const failed = find("failed");
  if (failed) {
    return {
      kind: "failed",
      label: t.failed(stageLabel(failed.name)),
      tone: "danger",
      stage: failed.name,
    };
  }
  const running = find("in_progress");
  if (running && stalled) {
    return {
      kind: "stalled",
      label: t.stalled(stageLabel(running.name)),
      tone: "danger",
      stage: running.name,
    };
  }
  if (running) {
    return {
      kind: "working",
      label: t.working(stageLabel(running.name)),
      tone: "info",
      stage: running.name,
    };
  }
  if (!hasPipelineState) {
    return renderCount > 0
      ? { kind: "done", label: t.videoReady, tone: "success", stage: null }
      : { kind: "empty", label: t.notStarted, tone: "neutral", stage: null };
  }
  const next = find("pending");
  if (!next || renderCount > 0) {
    return {
      kind: "done",
      label: renderCount > 0 ? t.videoReady : t.finished,
      tone: "success",
      stage: null,
    };
  }
  return {
    kind: "paused",
    label: t.paused(stageLabel(next.name)),
    tone: "neutral",
    stage: next.name,
  };
}

export function summaryStatus(s: ProjectSummary): ProjectStatus {
  return deriveStatus({
    stages: s.stage_states,
    hasPipelineState: s.has_pipeline_state,
    renderCount: s.render_count,
    stalled: Boolean(s.stalled),
  });
}

export function boardStatus(state: BoardState): ProjectStatus {
  const stages = state.stages.filter((s) => !s.undeclared);
  return deriveStatus({
    stages,
    hasPipelineState: state.has_pipeline_state,
    renderCount: state.media.renders.length,
    stalled: stages.some((s) => s.stalled),
  });
}

/** Fraction of declared steps completed (0–1). */
export function progress(stages: StageState[]): number {
  if (!stages.length) return 0;
  return stages.filter((s) => s.status === "completed").length / stages.length;
}

// ---- Decisions ------------------------------------------------------------

export interface DecisionView {
  key: string;
  category: string;
  subject: string;
  picked: string;
  reason: string | null;
  alternatives: string[];
  revisions: number;
}

/**
 * Collapse the append-only decision log to the CURRENT pick per
 * (category, subject) — same rule as the classic board's Decisions panel.
 */
export function currentDecisions(log: unknown): DecisionView[] {
  const decisions = (log as { decisions?: unknown } | undefined)?.decisions;
  if (!Array.isArray(decisions)) return [];
  const current = new Map<string, { d: Decision; order: number; revisions: number }>();
  decisions.forEach((raw, order) => {
    if (!raw || typeof raw !== "object") return;
    const d = raw as Decision;
    const key = `${d.category ?? "decision"}::${d.subject ?? ""}`;
    const prev = current.get(key);
    current.set(key, { d, order, revisions: prev ? prev.revisions + 1 : 0 });
  });
  return [...current.entries()]
    .sort(([, a], [, b]) => b.order - a.order)
    .map(([key, { d, revisions }]) => {
      const options = Array.isArray(d.options_considered) ? d.options_considered : [];
      const idOf = (o: { option_id?: string; label?: string }) => o.option_id ?? o.label;
      const picked = options.find((o) => idOf(o) === d.selected);
      return {
        key,
        category: titleCase(d.category ?? "decision"),
        subject: d.subject ?? "",
        picked: picked?.label ?? String(d.selected ?? ""),
        reason: d.reason ?? null,
        alternatives: options
          .filter((o) => idOf(o) !== d.selected)
          .map((o) => o.label ?? o.option_id ?? "")
          .filter(Boolean),
        revisions,
      };
    });
}

// ---- Activity -------------------------------------------------------------

export interface ActivityLine {
  ts: string;
  text: string;
  tone: Tone;
}

/** Tool events (events.jsonl) as readable lines, newest first. */
export function activityLines(events: ToolEvent[], limit = 50): ActivityLine[] {
  const t = msg().activity;
  return events
    .slice(-limit)
    .reverse()
    .map((e) => {
      const tool = e.tool ? titleCase(e.tool) : t.aTool;
      const where = e.scene_id ? t.forScene(e.scene_id) : "";
      if (e.event === "start") return { ts: e.ts, text: t.started(tool, where), tone: "info" };
      if (e.event === "finish" && e.success === false) {
        return { ts: e.ts, text: t.failed(tool, where, e.error ?? ""), tone: "danger" };
      }
      if (e.event === "finish") {
        const cost = e.cost_usd ? ` · ${fmtMoney(e.cost_usd)}` : "";
        return { ts: e.ts, text: t.finished(tool, where, cost), tone: "success" };
      }
      return { ts: e.ts, text: t.other(tool, e.event ?? t.event, where), tone: "neutral" };
    });
}

// ---- Artifacts --------------------------------------------------------------

export const asRecord = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

export const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export const asText = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v : typeof v === "number" ? String(v) : null;
