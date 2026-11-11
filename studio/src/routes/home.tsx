import { Link } from "react-router-dom";
import { Banner, Card, EmptyState, Spinner } from "@/components/ui";
import { DemoCards } from "@/features/demos/DemoCards";
import { ProjectCard } from "@/features/library/ProjectCard";
import { downloadURL } from "@/features/result/links";
import { UnlockMoreCard } from "@/features/setup/UnlockMoreCard";
import { summaryStatus } from "@/features/project/adapters";
import { useT } from "@/i18n";
import { useProjects, type ProjectSummary } from "@/lib/api";
import { ServerDown } from "./ServerDown";

export function HomePage() {
  const t = useT();
  const projects = useProjects();
  const all = projects.data ?? [];
  const byKind = (...kinds: string[]) => all.filter((p) => kinds.includes(summaryStatus(p).kind));
  const waiting = byKind("waiting");
  const attention = byKind("failed", "stalled");
  const working = byKind("working", "paused", "empty");
  const results = all
    .filter((p) => p.latest_render)
    .sort((a, b) => (b.last_activity ?? 0) - (a.last_activity ?? 0))
    .slice(0, 4);

  return (
    <section className="space-y-10">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{t.home.title}</h1>
        <p className="mt-2 max-w-2xl text-text-2">{t.home.intro}</p>
      </header>

      {projects.isPending && <Spinner label={t.home.loadingVideos} />}
      {projects.isError && <ServerDown />}

      {waiting.length > 0 && (
        <Banner tone="accent" title={t.home.waitingBanner(waiting.length)}>
          {t.home.waitingBannerBody}
        </Banner>
      )}

      <UnlockMoreCard />

      <ProjectSection title={t.home.sections.waiting} projects={waiting} />
      <ProjectSection title={t.home.sections.attention} projects={attention} />
      <ProjectSection title={t.home.sections.working} projects={working} />
      <ProjectSection title={t.home.sections.results} projects={results} withDownload />

      {projects.isSuccess && all.length === 0 && (
        <EmptyState
          title={t.home.emptyTitle}
          action={
            <Link to="/new" className="text-accent underline">
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
        <HomeCard to="/new" title={t.home.cards.newTitle} text={t.home.cards.newText} />
        <HomeCard to="/library" title={t.home.cards.libraryTitle} text={t.home.cards.libraryText} />
        <HomeCard to="/setup" title={t.home.cards.setupTitle} text={t.home.cards.setupText} />
      </div>
    </section>
  );
}

function ProjectSection({
  title,
  projects,
  withDownload = false,
}: {
  title: string;
  projects: ProjectSummary[];
  /** Finished videos: a direct download under each card. */
  withDownload?: boolean;
}) {
  const t = useT();
  if (!projects.length) return null;
  return (
    <section aria-label={title} className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {projects.map((p) =>
          withDownload && p.latest_render ? (
            <div key={p.project_id} className="space-y-2">
              <ProjectCard project={p} />
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
                  to={`/p/${encodeURIComponent(p.project_id)}`}
                  className="text-text-2 underline hover:text-text"
                >
                  {t.result.open}
                </Link>
              </div>
            </div>
          ) : (
            <ProjectCard key={p.project_id} project={p} />
          ),
        )}
      </div>
    </section>
  );
}

function HomeCard({ to, title, text }: { to: string; title: string; text: string }) {
  return (
    <Link to={to} className="group rounded-card focus-visible:outline-offset-4">
      <Card className="h-full transition group-hover:border-accent/60">
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-text-2">{text}</p>
      </Card>
    </Link>
  );
}
