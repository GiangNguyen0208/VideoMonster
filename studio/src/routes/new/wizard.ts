import { z } from "zod";
import {
  goalById,
  goalText,
  LIKE_THIS_GOAL_ID,
  PLATFORMS,
  toneForIntake,
  type Goal,
} from "@/content/goals";
import { getLocale, msg } from "@/i18n";
import { fileIssue } from "@/features/uploads/media";
import type { IntakeInput, PipelineInfo, Platform, StyleInfo, UploadLimits } from "@/lib/api";

/** Free-text list field ("a, b" or one per line) → trimmed items. */
export function splitList(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Validation messages are catalog keys (`wizard.errors`), so the schema stays
 * module-level while errors render in the current language via `errorText`.
 */
export const wizardSchema = z
  .object({
    goal: z.string().min(1, "goalRequired"),
    pipeline_type: z.string().min(1, "typeRequired"),
    reference_url: z.string().trim(),
    reference_notes: z.string().max(2000),
    topic: z.string().trim().min(3, "topicRequired").max(2000, "topicTooLong"),
    audience: z.string().max(300),
    platform: z.enum(["youtube", "shorts", "linkedin", "other"]),
    duration_seconds: z
      .number({ error: "lengthRequired" })
      .int()
      .min(5, "lengthMin")
      .max(3600, "lengthMax"),
    tone: z.array(z.string()),
    must_include: z.string().max(2000),
    avoid: z.string().max(2000),
    language: z.string().trim().min(2).max(20),
    target_languages: z.string().max(500),
    music_track: z.string().max(255),
    production_mode: z.string(),
    style_playbook: z.string(),
    cap_usd: z.number({ error: "amountRequired" }).min(0).max(1000),
    render_runtime_preference: z.enum(["", "remotion", "hyperframes"]),
    composition_mode_preference: z.enum(["", "templated", "atelier"]),
    checkpoint_policy: z.enum(["guided", "manual_all"]),
    title: z.string().max(120),
  })
  .superRefine((v, ctx) => {
    if (v.goal !== LIKE_THIS_GOAL_ID) return;
    if (!/^https?:\/\/\S+$/.test(v.reference_url)) {
      ctx.addIssue({
        code: "custom",
        path: ["reference_url"],
        message: "linkInvalid",
      });
    }
  });

export type WizardValues = z.infer<typeof wizardSchema>;

/** Error key from the schema → text in the current language. */
export function errorText(key: string | undefined): string | undefined {
  return key === undefined ? undefined : (msg().wizard.errors[key] ?? key);
}

export type StepKey = "goal" | "footage" | "brief" | "look" | "review";

/** Wizard steps for a goal: footage goals get "Add your footage" after the goal. */
export function stepsFor(goalId: string | null | undefined): StepKey[] {
  return goalById(goalId)?.footage
    ? ["goal", "footage", "brief", "look", "review"]
    : ["goal", "brief", "look", "review"];
}

/** Fields validated before leaving each step. */
export const STEP_FIELDS: Record<Exclude<StepKey, "review">, (keyof WizardValues)[]> = {
  goal: ["goal", "pipeline_type"],
  footage: ["target_languages", "production_mode"],
  brief: [
    "topic",
    "audience",
    "platform",
    "duration_seconds",
    "reference_url",
    "reference_notes",
    "must_include",
    "avoid",
    "language",
  ],
  look: ["cap_usd", "style_playbook", "music_track"],
};

/** A file picked in the wizard; it uploads once the project exists. */
export interface StagedFile {
  id: string;
  file: File;
  /** Seconds; `undefined` while the browser is still reading it. */
  duration: number | null | undefined;
}

/** True when the footage goal is in its "make it for me" mode (no files). */
export function skipsFootage(v: Pick<WizardValues, "goal" | "production_mode">): boolean {
  const optional = goalById(v.goal)?.footage?.optional;
  return Boolean(optional && v.production_mode === optional.skip_mode);
}

/** Why the footage step can't be left yet (a `wizard.footage.errors` key). */
export function footageProblem(
  v: Pick<WizardValues, "goal" | "production_mode" | "target_languages">,
  staged: StagedFile[],
  limits: UploadLimits | undefined,
): string | null {
  const needs = goalById(v.goal)?.footage;
  if (!needs) return null;
  if (needs.target_languages && splitList(v.target_languages).length === 0) {
    return "languagesRequired";
  }
  if (skipsFootage(v)) return null;
  if (staged.some((f) => fileIssue(f.file, needs.accept, limits) || tooShort(f, needs.min_s))) {
    return "fixFiles";
  }
  return staged.length === 0 ? "footageRequired" : null;
}

/** Known length below the goal's minimum. */
export function tooShort(f: StagedFile, min: number | undefined): boolean {
  return Boolean(min && typeof f.duration === "number" && f.duration < min);
}

export const EMPTY_VALUES: WizardValues = {
  goal: "",
  pipeline_type: "",
  reference_url: "",
  reference_notes: "",
  topic: "",
  audience: "",
  platform: "youtube",
  duration_seconds: 60,
  tone: [],
  must_include: "",
  avoid: "",
  language: "en",
  target_languages: "",
  music_track: "",
  production_mode: "",
  style_playbook: "",
  cap_usd: 0,
  render_runtime_preference: "",
  composition_mode_preference: "",
  checkpoint_policy: "guided",
  title: "",
};

export function presetFor(goal: Goal): Partial<WizardValues> {
  return {
    goal: goal.id,
    pipeline_type: goal.pipeline_type,
    platform: goal.preset.platform,
    duration_seconds: goal.preset.duration_seconds,
    tone: goal.preset.tone,
  };
}

export function aspectFor(platform: Platform) {
  return PLATFORMS.find((p) => p.id === platform)?.aspect ?? "16:9";
}

export function deriveTitle(topic: string): string {
  const t = topic.trim().replace(/\s+/g, " ");
  const short = t.length > 80 ? `${t.slice(0, 80).replace(/\s+\S*$/, "")}…` : t;
  return short.charAt(0).toUpperCase() + short.slice(1);
}

export function toIntake(v: WizardValues): IntakeInput {
  const likeThis = v.goal === LIKE_THIS_GOAL_ID;
  return {
    title: v.title.trim() || deriveTitle(v.topic),
    goal: v.goal,
    pipeline_type: v.pipeline_type,
    brief: {
      topic: v.topic.trim(),
      audience: v.audience.trim(),
      platform: v.platform,
      aspect: aspectFor(v.platform),
      duration_seconds: v.duration_seconds,
      tone: v.tone.map(toneForIntake).join(", "),
      must_include: splitList(v.must_include),
      avoid: splitList(v.avoid),
      target_languages: goalById(v.goal)?.footage?.target_languages
        ? splitList(v.target_languages)
        : [],
    },
    style_playbook: v.style_playbook || null,
    budget: { cap_usd: v.cap_usd, mode: "cap" },
    reference: {
      url: likeThis ? v.reference_url.trim() : null,
      notes: likeThis ? v.reference_notes.trim() || null : null,
    },
    advanced: {
      render_runtime_preference: v.render_runtime_preference || null,
      composition_mode_preference: v.composition_mode_preference || null,
      checkpoint_policy: v.checkpoint_policy,
      production_mode: v.production_mode || null,
    },
    music_track: v.music_track || null,
    language: v.language.trim(),
  };
}

export function goalTitle(v: Pick<WizardValues, "goal">): string {
  if (v.goal === LIKE_THIS_GOAL_ID) return msg().wizard.likeThis.reviewWhat;
  const goal = goalById(v.goal);
  return goal ? goalText(goal).title : v.goal;
}

/** Form defaults; narration language follows the Studio language. */
export function initialValues(): WizardValues {
  return { ...EMPTY_VALUES, language: getLocale() };
}

/** Styles this video type works with: recommended first, then the rest it allows. */
export function stylesFor(info: PipelineInfo | undefined, styles: StyleInfo[]): StyleInfo[] {
  if (!info) return styles;
  const { recommended, also_works, custom_allowed } = info.compatible_playbooks;
  const listed = [...recommended, ...also_works];
  if (listed.length === 0) return styles;
  const byName = new Map(styles.map((s) => [s.name, s]));
  const picked = listed.map((n) => byName.get(n)).filter((s): s is StyleInfo => Boolean(s));
  const extra = custom_allowed ? styles.filter((s) => s.custom && !listed.includes(s.name)) : [];
  return [...picked, ...extra];
}
