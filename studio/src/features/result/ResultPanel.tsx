import { useState } from "react";
import {
  Badge,
  Button,
  ButtonAnchor,
  Card,
  ComingSoon,
  CopyButton,
  ListBox,
} from "@/components/ui";
import { useT } from "@/i18n";
import { useResults } from "@/hooks/api";
import { downloadURL, exportUrl, mediaURL, thumbURL } from "@/services";
import type { RenderFile, ResultRender } from "@/types/api";
import { cn } from "@/utils/cn";
import { fmtBytes, fmtDuration, fmtFacts, fmtResolution } from "@/utils/format";

/**
 * The finished video: player, every render variant with its facts and a
 * download link, copy-ready publish text, and the export bundle.
 */
export function ResultPanel({ projectId, renders }: { projectId: string; renders: RenderFile[] }) {
  const t = useT();
  const L = t.result;
  const results = useResults(projectId, renders.length > 0).data;
  const [chosen, setChosen] = useState<string | null>(null);
  if (!renders.length) return null;

  // Board renders arrive first (newest first); details fill in from /results.
  const items: ResultRender[] = results?.renders.length
    ? [...results.renders].sort((a, b) => b.mtime - a.mtime)
    : renders.map((r) => ({
        path: r.path,
        name: r.path.split("/").pop() ?? r.path,
        size: r.size ?? 0,
        mtime: r.mtime ?? 0,
        label: null,
        resolution: null,
        duration_s: null,
        fps: null,
        in_report: false,
      }));
  const current = items.find((r) => r.path === chosen) ?? items[0]!;

  return (
    <section aria-labelledby="result-h" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="result-h" className="text-lg font-semibold">
          {t.project.result.heading}
        </h2>
        <ButtonAnchor
          variant="primary"
          href={downloadURL(projectId, current.path)}
          download={current.name}
        >
          {L.download}
        </ButtonAnchor>
      </div>
      <video
        key={current.path}
        controls
        preload="metadata"
        src={mediaURL(projectId, current.path)}
        poster={thumbURL(projectId, current.path, 960)}
        className="aspect-video w-full rounded-card border border-border bg-black shadow-elev-md"
      />

      <ListBox aria-label={L.variants}>
        {items.map((r) => (
          <li key={r.path} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
            <button
              type="button"
              aria-pressed={r.path === current.path}
              onClick={() => setChosen(r.path)}
              className={cn(
                "min-w-0 flex-1 truncate text-left text-sm",
                r.path === current.path ? "font-medium text-accent" : "hover:text-accent",
              )}
            >
              {r.name}
            </button>
            {r.label && <Badge tone="info">{r.label}</Badge>}
            <span className="text-xs text-text-3">{facts(r)}</span>
            <a
              href={downloadURL(projectId, r.path)}
              download={r.name}
              aria-label={L.downloadFile(r.name)}
              className="text-sm text-accent underline"
            >
              {L.downloadShort}
            </a>
          </li>
        ))}
      </ListBox>

      <ComingSoon>
        <div className="flex flex-wrap gap-2">
          <Button size="sm">{L.share}</Button>
          <Button size="sm">{L.clonePrompt}</Button>
        </div>
      </ComingSoon>

      {results && <PublishBox projectId={projectId} data={results} />}
    </section>
  );
}

function facts(r: ResultRender): string {
  return fmtFacts([
    fmtResolution(r.resolution),
    r.duration_s ? fmtDuration(r.duration_s) : null,
    r.fps ? `${r.fps} fps` : null,
    r.size ? fmtBytes(r.size) : null,
  ]);
}

function PublishBox({
  projectId,
  data,
}: {
  projectId: string;
  data: NonNullable<ReturnType<typeof useResults>["data"]>;
}) {
  const t = useT();
  const L = t.result;
  const p = data.publish;
  const rows = [
    { key: "title", label: L.fields.title, value: p.title },
    { key: "description", label: L.fields.description, value: p.description },
    {
      key: "hashtags",
      label: L.fields.hashtags,
      value: p.hashtags.length ? p.hashtags.join(" ") : null,
    },
  ].filter((r): r is { key: string; label: string; value: string } => Boolean(r.value));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card padding="sm" className="space-y-3">
        <h3 className="font-medium">{L.publishHeading}</h3>
        {p.source === "project" && <p className="text-xs text-text-3">{L.noPublishText}</p>}
        <dl className="space-y-3">
          {rows.map((r) => (
            <div key={r.key} className="space-y-1">
              <dt className="flex items-center justify-between gap-2 text-xs text-text-3">
                {r.label}
                <CopyButton text={r.value} label={L.copyField(r.label)} />
              </dt>
              <dd className="text-sm whitespace-pre-line">{r.value}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card padding="sm" className="space-y-2">
        <h3 className="font-medium">{L.exportHeading}</h3>
        {data.export ? (
          <>
            <p className="text-sm text-text-2">
              {data.export.kind === "folder"
                ? L.exportFolder(data.export.files, fmtBytes(data.export.size))
                : L.exportFile(fmtBytes(data.export.size))}
              {data.export.platform && <> · {data.export.platform}</>}
            </p>
            <ButtonAnchor href={exportUrl(projectId)} download={data.export.name}>
              {L.downloadExport}
            </ButtonAnchor>
          </>
        ) : (
          <p className="text-sm text-text-2">{L.askToExport}</p>
        )}
      </Card>
    </div>
  );
}
