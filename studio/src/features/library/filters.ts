import type { StatusKind } from "@/features/project/adapters";
import { summaryStatus } from "@/features/project/adapters";
import type { ProjectSummary } from "@/types/api";

export type StatusFilter = "all" | "waiting" | "active" | "attention" | "done";

/** Filter ids in display order; labels come from `t.library.filters`. */
export const STATUS_FILTERS: StatusFilter[] = ["all", "waiting", "active", "attention", "done"];

const KIND_TO_FILTER: Record<StatusKind, StatusFilter> = {
  waiting: "waiting",
  working: "active",
  paused: "active",
  failed: "attention",
  stalled: "attention",
  done: "done",
  empty: "active",
};

export function statusFilterOf(p: ProjectSummary): StatusFilter {
  return KIND_TO_FILTER[summaryStatus(p).kind];
}

export interface LibraryFilters {
  q: string;
  status: StatusFilter;
  type: string;
  /** Only this series (empty: all). */
  series?: string;
}

export function filterProjects(projects: ProjectSummary[], f: LibraryFilters): ProjectSummary[] {
  const q = f.q.trim().toLowerCase();
  return projects.filter(
    (p) =>
      (!q || p.title.toLowerCase().includes(q) || p.project_id.toLowerCase().includes(q)) &&
      (f.status === "all" || statusFilterOf(p) === f.status) &&
      (!f.type || p.pipeline_type === f.type) &&
      (!f.series || p.series === f.series),
  );
}

/** Group by series; projects without a series go last under null. */
export function groupBySeries(projects: ProjectSummary[]): [string | null, ProjectSummary[]][] {
  const groups = new Map<string | null, ProjectSummary[]>();
  for (const p of projects) {
    const key = p.series ?? null;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups.entries()].sort(([a], [b]) =>
    a === null ? 1 : b === null ? -1 : a.localeCompare(b),
  );
}

/** Distinct series names, sorted. */
export function seriesNames(projects: ProjectSummary[]): string[] {
  return [...new Set(projects.map((p) => p.series).filter((x): x is string => Boolean(x)))].sort(
    (a, b) => a.localeCompare(b),
  );
}
