/**
 * Pure helpers for the review panel: which step is under review, which Studio
 * decision belongs to it, and what the proposal picker starts from.
 */
import { asArray, asRecord, asText } from "@/features/project/adapters";
import type { BoardState, ProposalPicks, Stage, StudioDecision } from "@/types/api";

export type RuntimeId = "remotion" | "hyperframes" | "ffmpeg";
export type MusicSource = NonNullable<ProposalPicks["music_source"]>;

/** The step waiting for the user, if any (needs a timestamp to answer it). */
export function stageUnderReview(state: BoardState): Stage | null {
  return (
    state.stages.find((s) => !s.undeclared && s.status === "awaiting_human" && s.timestamp) ?? null
  );
}

/** Newest Studio decision for this exact checkpoint version. */
export function decisionFor(decisions: StudioDecision[], stage: Stage): StudioDecision | undefined {
  return decisions.find(
    (d) => d.stage === stage.name && d.checkpoint_timestamp === stage.timestamp,
  );
}

/** True when the user answered an earlier version of this step and the agent
 * has since written a new one (revised) — worth saying so. */
export function answeredEarlierVersion(decisions: StudioDecision[], stage: Stage): boolean {
  const latest = decisions.find((d) => d.stage === stage.name);
  return Boolean(latest && latest.checkpoint_timestamp !== stage.timestamp);
}

export interface ReviewCounts {
  summary: string | null;
  critical: number;
  suggestions: number;
  nitpicks: number;
}

/** Checkpoint `review` in either the compact form (counts + summary) or the
 * reviewer artifact form (`findings[]`). */
export function reviewCounts(review: unknown): ReviewCounts | null {
  const r = asRecord(review);
  if (!r) return null;
  const findings = asArray(r.findings)
    .map(asRecord)
    .filter((f): f is Record<string, unknown> => Boolean(f));
  const count = (key: string, severity: string) =>
    typeof r[key] === "number"
      ? (r[key] as number)
      : findings.filter((f) => f.severity === severity).length;
  return {
    summary: asText(r.summary),
    critical: count("critical", "critical"),
    suggestions: count("suggestions", "suggestion"),
    nitpicks: count("nitpicks", "nitpick"),
  };
}

export interface ConceptOption {
  id: string;
  title: string;
  hook: string | null;
  approach: string | null;
}

export interface ProposalDefaults {
  concepts: ConceptOption[];
  concept: string;
  estimate: number | null;
  budget: number | null;
  runtime: RuntimeId | null;
  mode: "templated" | "atelier" | null;
  music: MusicSource | null;
  /** Library track the plan names, if any. */
  musicTrack: string | null;
}

/** Rendering engines a proposal can pick, in display order. */
export const RUNTIMES: RuntimeId[] = ["remotion", "hyperframes", "ffmpeg"];
/** Music sources a proposal can pick, in display order. */
export const MUSIC_SOURCES: MusicSource[] = [
  "user_library",
  "ai_generated",
  "bring_your_own",
  "none",
];

export function proposalDefaults(packet: unknown): ProposalDefaults | null {
  const p = asRecord(packet);
  if (!p) return null;
  const concepts = asArray(p.concept_options)
    .map(asRecord)
    .filter((c): c is Record<string, unknown> => Boolean(c))
    .map((c, i) => ({
      id: asText(c.id) ?? String(i + 1),
      title: asText(c.title) ?? String(i + 1),
      hook: asText(c.hook),
      approach: asText(c.visual_approach),
    }));
  const plan = asRecord(p.production_plan);
  const cost = asRecord(p.cost_estimate);
  const approval = asRecord(p.approval);
  const chosen = asText(asRecord(p.selected_concept)?.concept_id);
  const estimate = typeof cost?.total_estimated_usd === "number" ? cost.total_estimated_usd : null;
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  const runtime = asText(plan?.render_runtime);
  const mode = asText(plan?.composition_mode);
  const musicSource = asRecord(plan?.music_source);
  const music = asText(musicSource?.source_type);
  return {
    concepts,
    concept: concepts.find((c) => c.id === chosen)?.id ?? concepts[0]?.id ?? "",
    estimate,
    budget: num(approval?.approved_budget_usd) ?? num(cost?.budget_cap_usd) ?? estimate,
    runtime: RUNTIMES.includes(runtime as RuntimeId) ? (runtime as RuntimeId) : null,
    mode: mode === "templated" || mode === "atelier" ? mode : null,
    music: MUSIC_SOURCES.includes(music as MusicSource) ? (music as MusicSource) : null,
    musicTrack: asText(musicSource?.track) ?? asText(musicSource?.track_name),
  };
}

/**
 * Why the agent rates each runtime, from its `render_runtime_selection`
 * decision-log entry (options_considered[].reason). Latest entry wins.
 */
export function runtimeRationale(decisionLog: unknown): Partial<Record<RuntimeId, string>> {
  const decisions = asArray(asRecord(decisionLog)?.decisions)
    .map(asRecord)
    .filter((d): d is Record<string, unknown> => Boolean(d))
    .filter((d) => d.category === "render_runtime_selection");
  const latest = decisions.at(-1);
  const out: Partial<Record<RuntimeId, string>> = {};
  for (const o of asArray(latest?.options_considered).map(asRecord)) {
    const id = asText(o?.option_id);
    const reason = asText(o?.reason);
    if (id && reason && RUNTIMES.includes(id as RuntimeId)) out[id as RuntimeId] = reason;
  }
  return out;
}

/** Runtimes to offer: always both Remotion and HyperFrames (AGENT_GUIDE hard
 * rule), plus FFmpeg only when the agent proposed it. */
export function runtimeOptions(proposed: RuntimeId | null): RuntimeId[] {
  return proposed === "ffmpeg"
    ? ["remotion", "hyperframes", "ffmpeg"]
    : ["remotion", "hyperframes"];
}

// ---- proposal picks (form state ↔ decision payload) ----------------------------

export interface Picks {
  concept: string;
  budget: string;
  runtime: RuntimeId | "";
  mode: "templated" | "atelier" | "";
  music: MusicSource | "";
  musicTrack: string;
}

export function initialPicks(
  d: ProposalDefaults,
  available: Record<string, boolean> | null,
): Picks {
  const usable = (r: RuntimeId | null) => r && (!available || available[r] !== false);
  const fallback = runtimeOptions(d.runtime).find((r) => usable(r)) ?? "";
  return {
    concept: d.concept,
    budget: d.budget != null ? String(d.budget) : "",
    runtime: usable(d.runtime) ? d.runtime! : fallback,
    mode: d.mode ?? "",
    music: d.music ?? "",
    musicTrack: d.musicTrack ?? "",
  };
}

export function toProposal(p: Picks): ProposalPicks {
  const budget = Number.parseFloat(p.budget);
  return {
    selected_concept_id: p.concept || null,
    approved_budget_usd: Number.isFinite(budget) && budget >= 0 ? budget : null,
    render_runtime: p.runtime || null,
    composition_mode: p.mode || null,
    music_source: p.music || null,
    music_track: p.music === "user_library" ? p.musicTrack || null : null,
  };
}

// ---- reference analysis (video_analysis_brief) -------------------------------

export interface ReferenceInsights {
  title: string | null;
  url: string | null;
  summary: string | null;
  scenes: number | null;
  avgSceneSeconds: number | null;
  tone: string | null;
  closestStyle: string | null;
  keep: string[];
  ownTake: string[];
}

/** What the agent learned from the user's reference video, if it saved it. */
export function referenceInsights(brief: unknown): ReferenceInsights | null {
  const b = asRecord(brief);
  if (!b) return null;
  const source = asRecord(b.source);
  const content = asRecord(b.content_analysis);
  const structure = asRecord(b.structure_analysis);
  const pacing = asRecord(structure?.pacing_profile);
  const style = asRecord(b.style_profile);
  const guide = asRecord(b.replication_guidance);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const texts = (v: unknown) =>
    asArray(v)
      .map(asText)
      .filter((s): s is string => Boolean(s));
  return {
    title: asText(source?.title),
    url: asText(source?.url),
    summary: asText(content?.summary),
    scenes: num(structure?.total_scenes),
    avgSceneSeconds: num(pacing?.avg_scene_duration_seconds),
    tone: asText(content?.tone),
    closestStyle: asText(style?.closest_playbook),
    keep: texts(guide?.key_elements_to_replicate),
    ownTake: texts(guide?.creative_differentiation_seeds),
  };
}
