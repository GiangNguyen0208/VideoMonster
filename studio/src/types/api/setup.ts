import type { Job } from "./jobs";

export type VideoTypeState = "ready" | "limited" | "locked";

export interface VideoTypeAvailability {
  pipeline: string;
  stability: string | null;
  state: VideoTypeState;
  missing_required: string[];
  missing_enhancements: string[];
}

export interface UnlockOffer {
  env_var: string;
  providers: string[];
  capabilities: string[];
  new_capabilities: string[];
  tools: string[];
  unlocks_video_types: string[];
  improves_video_types: string[];
  install_instructions: string;
  signup_url: string | null;
}

export interface KeyStatus {
  set: boolean;
  hint: string | null;
  source: "env_file" | "environment" | null;
}

export type Tier = "zero_key" | "starter" | "standard" | "full" | "full_gpu";

export interface SetupView {
  tier: Tier;
  tier_label: string;
  tier_explanation: string;
  runtimes: Record<string, boolean>;
  works_now: { capability: string; configured: number; total: number; providers: string[] }[];
  video_types: VideoTypeAvailability[];
  suggested_offers: UnlockOffer[];
  offers: UnlockOffer[];
  hardware: { tool: string; capability: string; provider: string; install_instructions: string }[];
  warnings: string[];
  keys: Record<string, KeyStatus>;
  checked_at: number | null;
  rechecking: Job | null;
}

/** `GET /api/v1/setup` answers 202 with a job while the first check runs. */
export type SetupResponse = SetupView | { status: "checking"; job: Job };

/** `PUT /api/v1/setup/env` response. */
export type SavedKey = KeyStatus & { key: string };
