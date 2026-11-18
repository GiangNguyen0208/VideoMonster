/** Spec mode: the agent plans once, Gemini executes (docs/planner-worker). */

export type SpecStepId = "requirements" | "spec" | "render" | "result";

export interface SpecFlow {
  steps: { id: SpecStepId; state: string }[];
  current: SpecStepId;
  /** The open review point, if any. `token` is the hash the user is shown. */
  gate: { stage: "requirements" | "spec" | "spec_recovery"; token: string } | null;
  gemini_key: boolean;
  spec_hash: string | null;
  estimated_cost_usd: number | null;
}

export interface BriefGoal {
  id: string;
  text: string;
  success_check: string;
}
export interface BriefImprovement {
  id: string;
  title: string;
  benefit: string;
  cost_delta_usd: number;
  risk: "low" | "medium" | "high";
  recommended: boolean;
  rationale: string;
}
export interface BriefQuestion {
  id: string;
  question: string;
  default_answer: string;
}
export interface BriefInput {
  id: string;
  label: string;
  help?: string;
  kind: "text" | "choice" | "file" | "boolean";
  required: boolean;
  options?: string[];
  accept?: "image" | "audio";
  default_answer?: string;
  required_if?: { input: string; equals: string };
  binds?: string;
}
export interface RequirementsBrief {
  summary: string;
  request: string;
  language: string;
  constraints: {
    duration_seconds: number;
    aspect_ratio: string;
    budget_cap_usd: number;
    must_include: string[];
    avoid: string[];
  };
  goals: BriefGoal[];
  non_goals: { id: string; text: string }[];
  scenarios: { id: string; viewer: string; situation: string; outcome: string }[];
  assumptions: string[];
  open_questions: BriefQuestion[];
  /** What only the video's creator can supply; absent in older briefs. */
  inputs?: BriefInput[];
  improvements: BriefImprovement[];
  approval: { status: string; selected_improvements?: string[]; answers?: Record<string, string> };
}
export interface RequirementsView {
  brief: RequirementsBrief;
  state: "invalid" | "pending" | "approved";
  errors: string[];
  token: string | null;
}

export interface SpecJob {
  job_id: string;
  scene_id: string;
  kind: "video" | "image" | "tts" | "music";
  tool: string;
  params: Record<string, unknown>;
  acceptance: Record<string, unknown>;
  estimated_cost_usd: number;
}
export interface SpecScene {
  id: string;
  start_seconds: number;
  end_seconds: number;
  script_section_id: string;
  serves: string[];
  description: string;
}
export interface ProductionSpec {
  spec_hash?: string;
  duration_seconds: number;
  aspect_ratio: string;
  style_summary: string;
  applied_improvements: string[];
  script: { sections: { id: string; text: string }[] };
  scenes: SpecScene[];
  jobs: SpecJob[];
  estimated_total_cost_usd?: number;
}
export interface SpecChange {
  job_id: string;
  old: { tool: string; params: Record<string, unknown> } | null;
  new: { tool: string; params: Record<string, unknown> };
  old_cost_usd: number | null;
  new_cost_usd: number | null;
}
export interface SpecView {
  spec: ProductionSpec;
  sealed: boolean;
  approved: boolean;
  errors: string[];
  token: string | null;
  changes: SpecChange[];
}

export interface WorkerJob {
  job_id: string;
  status: string;
  attempts: { label: string; tool: string }[];
  reasons?: string[];
  cost_usd?: number;
}
export interface RenderView {
  state: "locked" | "ready" | "running" | "partial" | "complete" | "failed";
  job: {
    id: string;
    status: "running" | "succeeded" | "failed";
    progress: number | null;
    error: string | null;
    output: { done: number; total: number; jobs: Record<string, string> } | null;
  } | null;
  report: { status: string; total_cost_usd: number; jobs: WorkerJob[] } | null;
  render_report: {
    outputs: { path: string; resolution: string; duration_seconds: number }[];
    warnings: string[];
    metadata: { final_check?: string };
  } | null;
  run: { status: string; error?: string | null } | null;
}

/** Body of the two gate decisions. `token` is `SpecFlow.gate.token`. */
export interface SpecDecisionInput {
  action: "approve" | "revise" | "abort";
  token: string;
  notes?: string;
  selected_improvements?: string[];
  answers?: Record<string, string>;
}
