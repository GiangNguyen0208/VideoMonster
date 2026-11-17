import type {
  BriefInput,
  ProductionSpec,
  RequirementsBrief,
  SpecJob,
  SpecStepId,
  StudioDecision,
  UploadKind,
} from "@/types/api";

/** Improvements the agent marked Recommended: the pre-ticked choices at Gate 1. */
export function defaultPicks(brief: RequirementsBrief): string[] {
  return brief.improvements.filter((i) => i.recommended).map((i) => i.id);
}

export function pickedCost(brief: RequirementsBrief, picks: string[]): number {
  return brief.improvements
    .filter((i) => picks.includes(i.id))
    .reduce((sum, i) => sum + i.cost_delta_usd, 0);
}

/** Upload kind a file input stores its file under (one kind per spec binding). */
const FILE_KIND: Record<string, UploadKind> = {
  voice_file: "voice",
  character_ref: "character_ref",
  logo_file: "logo",
  music_file: "music",
};

export function uploadKindOf(input: BriefInput): UploadKind {
  return (
    (input.binds && FILE_KIND[input.binds]) ||
    (input.accept === "audio" ? "voice" : "character_ref")
  );
}

/** The answer, or the input's own default when nothing was typed. */
export function effectiveAnswer(
  brief: RequirementsBrief,
  answers: Record<string, string>,
  id: string,
): string {
  const typed = (answers[id] ?? "").trim();
  return typed || (brief.inputs ?? []).find((i) => i.id === id)?.default_answer || "";
}

/** True when this input must be answered now (always, or because another answer says so). */
export function isRequired(
  brief: RequirementsBrief,
  input: BriefInput,
  answers: Record<string, string>,
): boolean {
  const cond = input.required_if;
  return (
    input.required || Boolean(cond && effectiveAnswer(brief, answers, cond.input) === cond.equals)
  );
}

/** Required inputs still empty: Approve stays disabled until this is empty. */
export function missingRequired(
  brief: RequirementsBrief,
  answers: Record<string, string>,
): BriefInput[] {
  return (brief.inputs ?? []).filter(
    (i) => isRequired(brief, i, answers) && !effectiveAnswer(brief, answers, i.id),
  );
}

/** Answers prefilled with the agent's defaults, overridden by what the user typed. */
export function answersWithDefaults(
  brief: RequirementsBrief,
  typed: Record<string, string>,
): Record<string, string> {
  const answers: Record<string, string> = Object.fromEntries(
    brief.open_questions.map((q) => [q.id, (typed[q.id] ?? "").trim() || q.default_answer]),
  );
  for (const input of brief.inputs ?? []) {
    const value = effectiveAnswer(brief, typed, input.id);
    if (value) answers[input.id] = value;
  }
  return answers;
}

export function jobsOfScene(spec: ProductionSpec, sceneId: string): SpecJob[] {
  return spec.jobs.filter((j) => j.scene_id === sceneId);
}

export function jobCounts(spec: ProductionSpec): Record<string, number> {
  const out: Record<string, number> = {};
  for (const j of spec.jobs) out[j.kind] = (out[j.kind] ?? 0) + 1;
  return out;
}

export function sectionText(spec: ProductionSpec, sectionId: string): string {
  return spec.script.sections.find((s) => s.id === sectionId)?.text ?? "";
}

/** Prompt-like text of a job for the review table (first string param that reads like one). */
export function jobPrompt(job: SpecJob): string {
  for (const key of ["prompt", "text", "description"]) {
    const v = job.params[key];
    if (typeof v === "string") return v;
  }
  return "";
}

/** The newest not-yet-applied decision for a review point. */
export function pendingDecision(
  decisions: StudioDecision[],
  stage: string,
): StudioDecision | undefined {
  return decisions.find((d) => d.stage === stage && d.state === "pending");
}

export function stateOf(
  steps: { id: SpecStepId; state: string }[] | undefined,
  id: SpecStepId,
): string {
  return steps?.find((s) => s.id === id)?.state ?? "locked";
}
