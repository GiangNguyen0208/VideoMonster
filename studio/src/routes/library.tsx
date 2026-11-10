import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { EmptyState, Spinner } from "@/components/ui";
import { videoTypeLabel } from "@/content/labels";
import { ProjectCard } from "@/features/library/ProjectCard";
import {
  STATUS_FILTERS,
  filterProjects,
  groupBySeries,
  type StatusFilter,
} from "@/features/library/filters";
import { useT } from "@/i18n";
import { useProjects } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ServerDown } from "./ServerDown";

export function LibraryPage() {
  const t = useT();
  const projects = useProjects();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const status = (params.get("status") as StatusFilter | null) ?? "all";
  const type = params.get("type") ?? "";
  const bySeries = params.get("view") === "series";

  const set = (key: string, value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  const all = useMemo(() => projects.data ?? [], [projects.data]);
  const types = useMemo(
    () => [...new Set(all.map((p) => p.pipeline_type).filter((t) => t && t !== "unknown"))],
    [all],
  );
  const shown = filterProjects(all, { q, status, type });

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t.library.title}</h1>
        <p className="mt-1 text-text-2">{t.library.intro}</p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => set("q", e.target.value)}
          placeholder={t.library.search}
          aria-label={t.library.search}
          className="h-10 w-full rounded-control border border-border bg-surface px-3 text-sm placeholder:text-text-3 sm:w-64"
        />
        <div role="group" aria-label={t.library.filterByStatus} className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={status === f}
              onClick={() => set("status", f === "all" ? "" : f)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                status === f
                  ? "border-accent bg-accent-dim text-text"
                  : "border-border text-text-2 hover:text-text",
              )}
            >
              {t.library.filters[f]}
            </button>
          ))}
        </div>
        {types.length > 1 && (
          <select
            value={type}
            onChange={(e) => set("type", e.target.value)}
            aria-label={t.library.filterByType}
            className="h-10 rounded-control border border-border bg-surface px-2 text-sm"
          >
            <option value="">{t.library.allTypes}</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {videoTypeLabel(t)}
              </option>
            ))}
          </select>
        )}
        <label className="ml-auto flex items-center gap-2 text-sm text-text-2">
          <input
            type="checkbox"
            checked={bySeries}
            onChange={(e) => set("view", e.target.checked ? "series" : "")}
          />
          {t.library.groupBySeries}
        </label>
      </div>

      {projects.isPending && <Spinner label={t.home.loadingVideos} />}
      {projects.isError && <ServerDown />}
      {projects.isSuccess && shown.length === 0 && (
        <EmptyState title={all.length ? t.library.noMatchTitle : t.library.emptyTitle}>
          {all.length ? t.library.noMatchBody : t.library.emptyBody}
        </EmptyState>
      )}

      {bySeries ? (
        groupBySeries(shown).map(([series, items]) => (
          <section key={series ?? "_none"} className="space-y-3">
            <h2 className="text-lg font-semibold">{series ?? t.library.noSeries}</h2>
            <Grid items={items} />
          </section>
        ))
      ) : (
        <Grid items={shown} />
      )}
    </section>
  );
}

function Grid({ items }: { items: ReturnType<typeof filterProjects> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((p) => (
        <ProjectCard key={p.project_id} project={p} />
      ))}
    </div>
  );
}
