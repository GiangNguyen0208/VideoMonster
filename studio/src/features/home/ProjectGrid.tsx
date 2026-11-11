import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge, ChipGroup, Section } from "@/components/ui";
import { ProjectCard } from "@/features/library/ProjectCard";
import { STATUS_FILTERS, filterProjects, type StatusFilter } from "@/features/library/filters";
import { useT } from "@/i18n";
import { downloadURL } from "@/services";
import type { ProjectSummary } from "@/types/api";
import { projectPath } from "@/utils/routes";

/** Home project grid: every video, narrowed with status chips (counts included). */
export function ProjectGrid({ projects }: { projects: ProjectSummary[] }) {
  const t = useT();
  const [status, setStatus] = useState<StatusFilter>("all");
  if (!projects.length) return null;
  const count = (s: StatusFilter) =>
    filterProjects(projects, { q: "", status: s, type: "" }).length;
  const shown = filterProjects(projects, { q: "", status, type: "" });

  return (
    <Section
      title={
        <span className="flex items-center gap-3">
          {t.home.projects.heading}
          <Badge>{t.home.projects.count(projects.length)}</Badge>
        </span>
      }
      description={t.home.projects.hint}
      action={
        <ChipGroup
          label={t.library.filterByStatus}
          hideLabel
          value={status}
          onChange={(v) => setStatus(v as StatusFilter)}
          options={STATUS_FILTERS.map((s) => ({
            value: s,
            label: `${t.library.filters[s]} (${count(s)})`,
          }))}
        />
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {shown.map((p) => (
          <div key={p.project_id} className="space-y-2">
            <ProjectCard project={p} />
            {p.latest_render && (
              <div className="flex gap-3 text-sm">
                <a
                  href={downloadURL(p.project_id, p.latest_render)}
                  download
                  aria-label={t.result.downloadFile(p.title)}
                  className="font-medium text-accent underline"
                >
                  {t.result.download}
                </a>
                <Link
                  to={projectPath(p.project_id)}
                  className="text-text-2 underline hover:text-text"
                >
                  {t.result.open}
                </Link>
              </div>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}
