/** Background job (`GET /api/v1/jobs/:id`): capability checks and demo renders. */
export interface Job {
  id: string;
  kind: string;
  status: "running" | "succeeded" | "failed";
  started_at: number;
  finished_at: number | null;
  error: string | null;
  /** 0..1 for jobs that report progress (demo renders). */
  progress?: number | null;
  /** Small result payload, e.g. `{ video_url }` for a demo render. */
  output?: Record<string, unknown> | null;
}
