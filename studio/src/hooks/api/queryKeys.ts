/**
 * Every React Query key, in one place. Project-scoped keys share the project
 * id so the project SSE stream can invalidate them together; month spend
 * sits under `projects` so the library stream refreshes it too.
 */
export const queryKeys = {
  session: ["session"] as const,
  projects: ["projects"] as const,
  monthSpend: (since: string) => ["projects", "month-spend", since] as const,
  project: (id: string) => ["project", id] as const,
  decisions: (id: string) => ["decisions", id] as const,
  inputs: (id: string) => ["inputs", id] as const,
  results: (id: string) => ["results", id] as const,
  cost: (id: string) => ["cost", id] as const,
  kickoff: (id: string) => ["kickoff", id] as const,
  pipelines: ["catalog", "pipelines"] as const,
  styles: ["catalog", "styles"] as const,
  demos: ["demos"] as const,
  setup: ["setup"] as const,
  job: (id: string) => ["job", id] as const,
  uploadLimits: ["upload-limits"] as const,
  music: ["music"] as const,
  settings: ["settings"] as const,
};

/** Old per-module key objects, kept so existing imports work until D.5.5. */
export const catalogKeys = {
  pipelines: queryKeys.pipelines,
  styles: queryKeys.styles,
  kickoff: queryKeys.kickoff,
  demos: queryKeys.demos,
};
export const setupKeys = { setup: queryKeys.setup, job: queryKeys.job };
export const musicKey = queryKeys.music;
export const settingsKey = queryKeys.settings;
