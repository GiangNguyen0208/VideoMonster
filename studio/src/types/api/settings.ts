export interface StudioSettings {
  budget: {
    mode: "observe" | "warn" | "cap";
    total_usd: number;
    single_action_approval_usd: number;
    require_approval_for_new_paid_tool: boolean;
  };
  checkpoint: { policy: "guided" | "manual_all" | "auto_noncreative" };
  output: { default_resolution: string; default_fps: number };
}

export interface SettingsView {
  settings: StudioSettings;
  choices: { resolutions: string[]; fps: number[] };
}
