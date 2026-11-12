export type DecisionAction = "approve" | "revise" | "abort";
export type DecisionState = "pending" | "consumed" | "stale";

export interface ProposalPicks {
  selected_concept_id?: string | null;
  approved_budget_usd?: number | null;
  render_runtime?: "remotion" | "hyperframes" | "ffmpeg" | null;
  composition_mode?: "templated" | "atelier" | null;
  music_source?: "user_library" | "ai_generated" | "bring_your_own" | "none" | null;
  /** Track from music_library/ when music_source is "user_library". */
  music_track?: string | null;
  voice?: string | null;
}

export interface DecisionInput {
  stage: string;
  checkpoint_timestamp: string;
  action: DecisionAction;
  notes: string;
  proposal?: ProposalPicks | null;
}

export interface StudioDecision extends DecisionInput {
  schema: "studio.decision/1";
  id: string;
  created_at: string;
  source: "studio";
  state: DecisionState;
}
