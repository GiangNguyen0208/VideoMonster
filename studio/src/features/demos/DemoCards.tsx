import { Button, Card, ErrorText, ProgressBar } from "@/components/ui";
import { useT } from "@/i18n";
import { useDemoRender, useDemos } from "@/hooks/api";
import type { Demo } from "@/types/api";
import { errorText } from "@/utils/errors";

/** Home → "Try a demo": zero-key Remotion demos rendered from the browser. */
export function DemoCards() {
  const t = useT();
  const demos = useDemos();
  if (!demos.data?.length) return null;
  return (
    <section aria-labelledby="demos-h" className="space-y-3">
      <div>
        <h2 id="demos-h" className="text-lg font-semibold">
          {t.demos.heading}
        </h2>
        <p className="text-sm text-text-2">{t.demos.intro}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {demos.data.map((d) => (
          <DemoCard key={d.name} demo={d} />
        ))}
      </div>
    </section>
  );
}

function DemoCard({ demo }: { demo: Demo }) {
  const { start, job } = useDemoRender(demo);
  const t = useT();
  const L = t.demos;
  const description = L.descriptions[demo.name] ?? demo.description;
  const running = start.isPending || job?.status === "running";
  const failed = job?.status === "failed" ? job.error : null;
  const startError = errorText(start.error);
  const videoUrl = (job?.output?.video_url as string | undefined) ?? demo.video_url;
  const pct = Math.round((job?.progress ?? 0) * 100);

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h3 className="font-medium">{demo.title}</h3>
        <p className="text-sm text-text-2">{description}</p>
      </div>
      {videoUrl && !running && (
        <video
          src={videoUrl}
          controls
          preload="none"
          className="aspect-video w-full rounded-control bg-black"
          aria-label={L.videoLabel(demo.title)}
        />
      )}
      {running && (
        <div className="space-y-1" role="status">
          <ProgressBar value={pct / 100} label={L.rendering(demo.title)} className="h-2" />
          <p className="text-xs text-text-3">{pct > 0 ? L.progress(pct) : L.preparing}</p>
        </div>
      )}
      {(failed || startError) && <ErrorText>{L.failed(failed ?? startError ?? "")}</ErrorText>}
      <div className="mt-auto">
        <Button
          size="sm"
          variant={videoUrl ? "ghost" : "primary"}
          disabled={running}
          onClick={() => start.mutate()}
        >
          {videoUrl ? L.renderAgain : L.render}
        </Button>
      </div>
    </Card>
  );
}
