import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge, Button, ComingSoon, EmptyState, Section, Spinner } from "@/components/ui";
import { Download, FileText } from "@/components/icons";
import { PageHeader } from "@/components/layout/PageHeader";
import { ServerDown } from "@/components/layout/ServerDown";
import { ProjectCard } from "@/features/library/ProjectCard";
import { LibraryStats } from "@/features/library/LibraryStats";
import { LibraryToolbar } from "@/features/library/LibraryToolbar";
import { ReviewNowCards } from "@/features/library/ReviewNowCards";
import {
  STATUS_FILTERS,
  filterProjects,
  groupBySeries,
  statusFilterOf,
  type StatusFilter,
} from "@/features/library/filters";
import { useT } from "@/i18n";
import { useProjects } from "@/hooks/api";
import type { ProjectSummary } from "@/types/api";

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
    () => [...new Set(all.map((p) => p.pipeline_type).filter((x) => x && x !== "unknown"))],
    [all],
  );
  const shown = filterProjects(all, { q, status, type });
  const counts = Object.fromEntries(
    STATUS_FILTERS.map((f) => [
      f,
      f === "all" ? all.length : all.filter((p) => statusFilterOf(p) === f).length,
    ]),
  ) as Record<StatusFilter, number>;

  return (
    <div className="space-y-8">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {t.library.title}
            {all.length > 0 && <Badge>{t.home.projects.count(all.length)}</Badge>}
          </span>
        }
        description={t.library.intro}
        actions={
          <ComingSoon inline>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" leftIcon={<FileText className="size-4" />}>
                {t.library.exportCost}
              </Button>
              <Button size="sm" variant="secondary" leftIcon={<Download className="size-4" />}>
                {t.library.cleanTemp}
              </Button>
            </div>
          </ComingSoon>
        }
      />

      <LibraryStats projects={all} />
      <ReviewNowCards projects={all.filter((p) => statusFilterOf(p) === "waiting")} />

      <LibraryToolbar
        q={q}
        status={status}
        type={type}
        types={types}
        bySeries={bySeries}
        counts={counts}
        onChange={set}
      />

      {projects.isPending && <Spinner label={t.home.loadingVideos} />}
      {projects.isError && <ServerDown />}
      {projects.isSuccess && shown.length === 0 && (
        <EmptyState title={all.length ? t.library.noMatchTitle : t.library.emptyTitle}>
          {all.length ? t.library.noMatchBody : t.library.emptyBody}
        </EmptyState>
      )}

      {bySeries ? (
        groupBySeries(shown).map(([series, items]) => (
          <Section
            key={series ?? "_none"}
            title={series ?? t.library.noSeries}
            action={<Badge>{t.home.projects.count(items.length)}</Badge>}
          >
            <Grid items={items} />
          </Section>
        ))
      ) : (
        <Grid items={shown} />
      )}
    </div>
  );
}

function Grid({ items }: { items: ProjectSummary[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((p) => (
        <ProjectCard key={p.project_id} project={p} />
      ))}
    </div>
  );
}
