/**
 * What a newcomer wants to make → which pipeline makes it
 * (docs/ui-plan/02-use-cases.md §3). Studio shows goals, never pipeline names.
 * Titles, promises and example topics live in the i18n catalogs (`goals`).
 *
 * Every user-facing manifest in pipeline_defs/ must have exactly one goal;
 * tests/contracts/test_studio_wizard_contract.py enforces that from the Python side.
 */
import { CATALOGS, msg } from "@/i18n";
import type { MediaKind, Platform } from "@/types/api";

export interface GoalPreset {
  platform: Platform;
  duration_seconds: number;
  /** Tone ids — keys of `wizard.brief.tones` in the catalogs. */
  tone: string[];
}

/** What the "Add your footage" wizard step asks for. */
export interface FootageNeeds {
  accept: MediaKind[];
  /** Shortest useful source in seconds (checked on the longest file). */
  min_s?: number;
  /**
   * Uploading is optional. With files the agent edits them (`upload_mode`);
   * without, it makes the footage itself (`skip_mode`). Both are
   * `production_modes` of the pipeline manifest.
   */
  optional?: { upload_mode: string; skip_mode: string };
  /** Ask which languages to translate into (localization-dub). */
  target_languages?: boolean;
}

/** Filter chips on the goal step; labels in `wizard.categories`. */
export type GoalCategory = "visual" | "story" | "footage" | "tech";

export interface Goal {
  id: string;
  icon: string;
  category: GoalCategory;
  pipeline_type: string;
  /** Set when the agent works from the user's own media. */
  footage?: FootageNeeds;
  preset: GoalPreset;
}

export interface GoalText {
  title: string;
  promise: string;
  /** Topic starters, adapted from PROMPT_GALLERY.md. */
  examples: string[];
}

/** Localized title, promise and examples for a goal. */
export function goalText(goal: Goal): GoalText {
  return msg().goals[goal.id] ?? { title: goal.id, promise: "", examples: [] };
}

export const GOAL_CATEGORIES: GoalCategory[] = ["visual", "story", "footage", "tech"];

export const GOALS: Goal[] = [
  {
    id: "explain-topic",
    icon: "💡",
    category: "visual",
    pipeline_type: "animated-explainer",
    preset: { platform: "youtube", duration_seconds: 60, tone: ["friendly", "clear"] },
  },
  {
    id: "animated",
    icon: "🎨",
    category: "visual",
    pipeline_type: "animation",
    preset: { platform: "shorts", duration_seconds: 30, tone: ["dreamy"] },
  },
  {
    id: "trailer",
    icon: "🎬",
    category: "story",
    pipeline_type: "cinematic",
    preset: { platform: "youtube", duration_seconds: 30, tone: ["dramatic"] },
  },
  {
    id: "character-story",
    icon: "🧸",
    category: "story",
    pipeline_type: "character-animation",
    preset: { platform: "shorts", duration_seconds: 30, tone: ["playful"] },
  },
  {
    id: "app-demo",
    icon: "💻",
    category: "tech",
    pipeline_type: "screen-demo",
    footage: {
      accept: ["video"],
      optional: { upload_mode: "real_capture", skip_mode: "synthetic_terminal" },
    },
    preset: { platform: "youtube", duration_seconds: 60, tone: ["clear", "professional"] },
  },
  {
    id: "footage-visuals",
    icon: "🎞️",
    category: "footage",
    pipeline_type: "hybrid",
    footage: { accept: ["video", "image", "audio"] },
    preset: { platform: "youtube", duration_seconds: 60, tone: ["professional"] },
  },
  {
    id: "ai-presenter",
    icon: "🧑‍💼",
    category: "story",
    pipeline_type: "avatar-spokesperson",
    preset: { platform: "linkedin", duration_seconds: 60, tone: ["professional"] },
  },
  {
    id: "polish-talking",
    icon: "🎙️",
    category: "footage",
    pipeline_type: "talking-head",
    footage: { accept: ["video"] },
    preset: { platform: "youtube", duration_seconds: 90, tone: ["friendly"] },
  },
  {
    id: "long-to-clips",
    icon: "✂️",
    category: "footage",
    pipeline_type: "clip-factory",
    footage: { accept: ["video"], min_s: 300 },
    preset: { platform: "shorts", duration_seconds: 30, tone: ["energetic"] },
  },
  {
    id: "podcast-highlights",
    icon: "🎧",
    category: "footage",
    pipeline_type: "podcast-repurpose",
    footage: { accept: ["audio", "video"], min_s: 300 },
    preset: { platform: "shorts", duration_seconds: 45, tone: ["conversational"] },
  },
  {
    id: "translate-dub",
    icon: "🌐",
    category: "footage",
    pipeline_type: "localization-dub",
    footage: { accept: ["video", "audio", "subtitle"], target_languages: true },
    preset: { platform: "youtube", duration_seconds: 60, tone: ["faithful"] },
  },
  {
    id: "archive-montage",
    icon: "📽️",
    category: "visual",
    pipeline_type: "documentary-montage",
    preset: { platform: "youtube", duration_seconds: 90, tone: ["reflective"] },
  },
];

/** The reference-driven entry: "make something like this link". */
export const LIKE_THIS_GOAL_ID = "like-this";

/** Labels come from `wizard.brief.platforms`. */
export const PLATFORMS: { id: Platform; aspect: "16:9" | "9:16" | "1:1" }[] = [
  { id: "youtube", aspect: "16:9" },
  { id: "shorts", aspect: "9:16" },
  { id: "linkedin", aspect: "1:1" },
  { id: "other", aspect: "16:9" },
];

export const DURATIONS = [15, 30, 60, 90];

/** Tone chips always offered (goal presets may add others). */
export const TONES = [
  "friendly",
  "clear",
  "professional",
  "energetic",
  "calm",
  "playful",
  "dramatic",
  "inspiring",
];

/** Tone in the UI language. */
export function toneLabel(id: string): string {
  return msg().wizard.brief.tones[id] ?? id;
}

/**
 * Tone as written into intake.json. Always English so the brief the agent
 * reads is stable whatever language the Studio UI is in; unknown ids are
 * free text from the user and pass through.
 */
export function toneForIntake(id: string): string {
  return CATALOGS.en.wizard.brief.tones[id] ?? id;
}

export function goalById(id: string | null | undefined): Goal | undefined {
  return GOALS.find((g) => g.id === id);
}

export function goalForPipeline(pipelineType: string): Goal | undefined {
  return GOALS.find((g) => g.pipeline_type === pipelineType);
}
