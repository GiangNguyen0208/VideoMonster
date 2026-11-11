import { Link } from "react-router-dom";
import { Badge } from "@/components/ui";
import { videoTypeLabel } from "@/content/labels";
import { summaryStatus, progress } from "@/features/project/adapters";
import { useT } from "@/i18n";
import type { ProjectSummary } from "@/lib/api";
import { fmtAgo, fmtMoney, thumbURL } from "@/lib/format";

export function ProjectCard({ project }: { project: ProjectSummary }) {
  const t = useT();
  const status = summaryStatus(project);
  const pct = Math.round(progress(project.stage_states) * 100);
  const poster = project.poster ?? project.latest_render ?? null;

  return (
    <Link
      to={`/p/${encodeURIComponent(project.project_id)}`}
      className="group block overflow-hidden rounded-card border border-border bg-surface transition hover:border-accent/60"
    >
      <div className="relative aspect-video bg-surface-2">
        {poster ? (
          <img
            src={thumbURL(project.project_id, poster, 640)}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-text-3">
            {t.library.card.noPreview}
          </div>
        )}
        {project.live && (
          <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-xs text-white">
            <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-success" />{" "}
            {t.common.live}
          </span>
        )}
      </div>
      <div className="space-y-2 p-4">
        <div>
          <h3 className="truncate font-semibold group-hover:text-accent">{project.title}</h3>
          <p className="text-sm text-text-3">
            {videoTypeLabel(project.pipeline_type)}
            {project.series ? ` · ${project.series}` : ""}
          </p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
        {project.has_pipeline_state && project.stage_states.length > 0 && (
          <div
            role="progressbar"
            aria-label={t.library.card.stepsCompleted}
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1.5 overflow-hidden rounded-full bg-surface-3"
          >
            <div className="h-full bg-success" style={{ width: `${pct}%` }} />
          </div>
        )}
        <p className="flex justify-between text-xs text-text-3">
          <span>
            {project.has_pipeline_state
              ? t.library.card.steps(project.completed_count, project.stage_states.length)
              : t.library.card.videos(project.render_count)}
            {project.last_activity ? ` · ${fmtAgo(project.last_activity)}` : ""}
          </span>
          {project.cost_usd != null && <span>{fmtMoney(project.cost_usd)}</span>}
        </p>
      </div>
    </Link>
  );
}
