import { Link } from "react-router-dom";
import { ButtonLink, Card, EmptyState, Spinner } from "@/components/ui";
import { Library, Plus, Settings, Sparkles, type LucideIcon } from "@/components/icons";
import { PageHeader } from "@/components/layout/PageHeader";
import { ServerDown } from "@/components/layout/ServerDown";
import { DemoCards } from "@/features/demos/DemoCards";
import { ProjectGrid } from "@/features/home/ProjectGrid";
import { WaitingHero } from "@/features/home/WaitingHero";
import { summaryStatus } from "@/features/project/adapters";
import { UnlockMoreCard } from "@/features/setup/UnlockMoreCard";
import { useT } from "@/i18n";
import { useProjects } from "@/hooks/api";
import { newVideoPath } from "@/utils/routes";

export function HomePage() {
  const t = useT();
  const projects = useProjects();
  const all = projects.data ?? [];
  const waiting = all.filter((p) => summaryStatus(p).kind === "waiting");
  const sorted = [...all].sort((a, b) => (b.last_activity ?? 0) - (a.last_activity ?? 0));

  return (
    <div className="space-y-10">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Sparkles aria-hidden className="size-7 text-accent" />
            {t.home.title}
          </span>
        }
        description={t.home.intro}
        actions={
          <ButtonLink
            to={newVideoPath()}
            variant="primary"
            size="lg"
            leftIcon={<Plus className="size-4" />}
          >
            {t.home.newVideo}
          </ButtonLink>
        }
      />

      {projects.isPending && <Spinner label={t.home.loadingVideos} />}
      {projects.isError && <ServerDown />}

      {waiting[0] && <WaitingHero project={waiting[0]} count={waiting.length} />}

      <UnlockMoreCard />

      <ProjectGrid projects={sorted} />

      {projects.isSuccess && all.length === 0 && (
        <EmptyState
          title={t.home.emptyTitle}
          action={
            <Link to={newVideoPath()} className="text-accent underline">
              {t.home.emptyAction}
            </Link>
          }
        >
          {t.home.emptyBodyBefore} <code className="font-mono">{t.home.exampleCommand}</code>
          {t.home.emptyBodyAfter}
        </EmptyState>
      )}

      <DemoCards />

      <div className="grid gap-4 sm:grid-cols-3">
        <HomeCard
          to={newVideoPath()}
          icon={Plus}
          title={t.home.cards.newTitle}
          text={t.home.cards.newText}
        />
        <HomeCard
          to="/library"
          icon={Library}
          title={t.home.cards.libraryTitle}
          text={t.home.cards.libraryText}
        />
        <HomeCard
          to="/setup"
          icon={Settings}
          title={t.home.cards.setupTitle}
          text={t.home.cards.setupText}
        />
      </div>
    </div>
  );
}

function HomeCard({
  to,
  icon: Icon,
  title,
  text,
}: {
  to: string;
  icon: LucideIcon;
  title: string;
  text: string;
}) {
  return (
    <Link to={to} className="group rounded-card focus-visible:outline-offset-4">
      <Card variant="interactive" className="flex h-full items-start gap-4">
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-control border border-border bg-surface-high text-accent"
        >
          <Icon className="size-5" />
        </span>
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-text-2">{text}</p>
        </div>
      </Card>
    </Link>
  );
}
