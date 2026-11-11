/**
 * Shapes returned by the Backlot read API (backlot/state.py).
 * Artifacts are agent-authored JSON, so everything inside them is optional
 * and adapters must tolerate missing or oddly-typed fields.
 */

/** Stage status as written in checkpoints (`lib/checkpoint.py`), plus "pending". */
export type StepState = "completed" | "in_progress" | "awaiting_human" | "failed" | "pending";

export interface StageState {
  name: string;
  status: StepState;
}

export interface ProjectSummary {
  project_id: string;
  title: string;
  series: string | null;
  pipeline_type: string;
  has_pipeline_state: boolean;
  poster: string | null;
  live: boolean;
  last_activity: number | null;
  active_stage: string | null;
  awaiting_human: boolean;
  stage_states: StageState[];
  completed_count: number;
  render_count: number;
  scene_count: number;
  stalled?: boolean;
  failed?: boolean;
  latest_render?: string | null;
  cost_usd?: number | null;
  error?: string;
}

export interface CheckpointReview {
  summary?: string;
  [key: string]: unknown;
}

export interface Stage {
  name: string;
  gated: boolean;
  produces: string[];
  status: StepState;
  timestamp?: string | null;
  review?: CheckpointReview | null;
  cost_snapshot?: CostSnapshot | null;
  error?: unknown;
  human_approved?: boolean;
  partial_progress?: unknown;
  versions?: number;
  stalled?: boolean;
  stalled_minutes?: number;
  undeclared?: boolean;
  gate_skipped?: boolean;
}

export interface CostSnapshot {
  total_spent_usd?: number;
  total_reserved_usd?: number;
  budget_remaining_usd?: number;
}

export interface MediaItem {
  id?: string;
  type?: string;
  path: string;
  exists?: boolean;
  renderable?: boolean;
  prompt?: string | null;
  model?: string | null;
  source_tool?: string | null;
  cost_usd?: number | null;
  duration_seconds?: number | null;
}

export interface Scene {
  id: string;
  type?: string;
  description?: string | null;
  start_seconds?: number | null;
  end_seconds?: number | null;
  duration_seconds?: number | null;
  hero_moment?: boolean;
  narration?: string | null;
  section_label?: string | null;
  visual?: MediaItem | null;
  takes?: MediaItem[];
  audio?: MediaItem[];
  generating?: boolean;
  generating_tool?: string | null;
}

export interface Storyboard {
  scenes: Scene[];
  total_duration_seconds?: number | null;
  style_playbook?: string | null;
}

export interface RenderFile {
  path: string;
  size?: number;
  mtime?: number;
  at_root?: boolean;
}

export interface ToolEvent {
  ts: string;
  tool?: string;
  event?: string;
  scene_id?: string;
  success?: boolean;
  cost_usd?: number;
  duration_s?: number;
  output_path?: string;
  error?: string;
}

export interface Decision {
  decision_id?: string;
  stage?: string;
  category?: string;
  subject?: string;
  options_considered?: Array<{ option_id?: string; label?: string; rejected_because?: string }>;
  selected?: string;
  reason?: string;
  confidence?: string | number;
}

export type ArtifactMap = Record<string, Record<string, unknown> | undefined>;

export interface BoardState {
  project_id: string;
  title: string;
  pipeline: { pipeline_type: string; stages: Stage[]; known: boolean };
  style_playbook: string | null;
  series: string | null;
  created_at: string | null;
  has_marker: boolean;
  has_pipeline_state: boolean;
  stages: Stage[];
  artifacts: ArtifactMap;
  storyboard: Storyboard | null;
  media: { renders: RenderFile[]; snapshots: { path: string }[]; music: { path: string }[] };
  events: ToolEvent[];
  cost: CostSnapshot | null;
  last_activity: number | null;
  live: boolean;
  poster: string | null;
}
