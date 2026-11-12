import type { Job } from "./jobs";
import type { VideoTypeState } from "./setup";

export interface PipelineInfo {
  name: string;
  description: string;
  category: string | null;
  stability: string | null;
  stages: { name: string; gated: boolean }[];
  reference_input: boolean;
  compatible_playbooks: { recommended: string[]; also_works: string[]; custom_allowed: boolean };
  production_modes: { name: string; description: string }[];
  budget_default_usd: number | null;
  default_checkpoint_policy: string | null;
  availability: {
    state: VideoTypeState;
    missing_required: string[];
    missing_enhancements: string[];
  } | null;
}

export interface CatalogDefaults {
  mode: string;
  total_usd: number | null;
  checkpoint_policy: string;
}

export interface PipelinesResponse {
  pipelines: PipelineInfo[];
  checked: boolean;
  defaults: CatalogDefaults;
}

export interface StyleInfo {
  name: string;
  title: string;
  mood: string | null;
  best_for: string | null;
  palette: string[];
  custom: boolean;
}

export type Platform = "youtube" | "shorts" | "linkedin" | "other";
export type Aspect = "16:9" | "9:16" | "1:1" | "4:5";

/** Body of POST /api/v1/projects — `studio.intake/1` minus server-set fields. */
export interface IntakeInput {
  title: string;
  goal: string;
  pipeline_type: string;
  brief: {
    topic: string;
    audience: string;
    platform: Platform;
    aspect: Aspect;
    duration_seconds: number;
    tone: string;
    must_include: string[];
    avoid: string[];
    target_languages: string[];
  };
  style_playbook: string | null;
  budget: { cap_usd: number; mode: "observe" | "warn" | "cap" };
  reference: { url: string | null; notes: string | null };
  advanced: {
    render_runtime_preference: "remotion" | "hyperframes" | null;
    composition_mode_preference: "templated" | "atelier" | null;
    checkpoint_policy: "guided" | "manual_all" | null;
    production_mode: string | null;
  };
  music_track: string | null;
  language: string;
}

export interface KickoffAgent {
  id: string;
  label: string;
  command: string;
  note: string;
}

export interface Kickoff {
  project_id: string;
  request: string;
  agents: KickoffAgent[];
  started?: boolean;
}

export interface Demo {
  name: string;
  title: string;
  description: string;
  rendered: boolean;
  video_url: string | null;
  job: Job | null;
}

/** `POST /api/v1/projects` response. */
export interface CreatedProject {
  project_id: string;
  kickoff: Kickoff;
}
