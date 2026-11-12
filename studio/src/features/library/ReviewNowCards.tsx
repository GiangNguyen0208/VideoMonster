import { Badge, ButtonLink, Card, Section } from "@/components/ui";
import { ArrowRight } from "@/components/icons";
import { stageLabel } from "@/content/labels";
import { useT } from "@/i18n";
import type { ProjectSummary } from "@/types/api";
import { fmtAgo } from "@/utils/format";
import { projectPath } from "@/utils/routes";

/** Videos waiting on the user, each with one button into its review. */
export function ReviewNowCards({ projects }: { projects: ProjectSummary[] }) {
  const t = useT();
  if (!projects.length) return null;
  return (
    <Section title={t.library.reviewNow} description={t.library.reviewNowHint}>
      <div className="grid gap-4 md:grid-cols-2">
        {projects.map((p) => {
          const step = p.stage_states.find((s) => s.status === "awaiting_human")?.name;
          return (
            <Card key={p.project_id} variant="active" className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  {step && (
                    <Badge tone="accent" size="sm">
                      {stageLabel(step)}
                    </Badge>
                  )}
                  {p.last_activity && (
                    <span className="text-xs text-text-3">{fmtAgo(p.last_activity)}</span>
                  )}
                </div>
                <h3 className="truncate font-semibold">{p.title}</h3>
              </div>
              <ButtonLink
                to={projectPath(p.project_id)}
                variant="primary"
                size="sm"
                rightIcon={<ArrowRight className="size-4" />}
                aria-label={t.library.reviewTitle(p.title)}
              >
                {t.library.review}
              </ButtonLink>
            </Card>
          );
        })}
      </div>
    </Section>
  );
}
