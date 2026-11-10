import { useT } from "@/i18n";
import type { RenderFile } from "@/lib/api";
import { fmtBytes, mediaURL, thumbURL } from "@/lib/format";

/** Latest render in a player, older renders listed below. */
export function ResultView({ projectId, renders }: { projectId: string; renders: RenderFile[] }) {
  const t = useT();
  if (!renders.length) return null;
  const sorted = [...renders].sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0));
  const [latest, ...older] = sorted as [RenderFile, ...RenderFile[]];
  return (
    <section aria-labelledby="result-h" className="space-y-3">
      <h2 id="result-h" className="text-lg font-semibold">
        {t.project.result.heading}
      </h2>
      <video
        key={latest.path}
        controls
        preload="metadata"
        src={mediaURL(projectId, latest.path)}
        poster={thumbURL(projectId, latest.path, 960)}
        className="aspect-video w-full rounded-card border border-border bg-black"
      />
      <p className="text-sm text-text-3">
        {latest.path.split("/").pop()} {latest.size ? `· ${fmtBytes(latest.size)}` : ""}
      </p>
      {older.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-text-2">
            {t.project.result.earlier(older.length)}
          </summary>
          <ul className="mt-2 space-y-1">
            {older.map((r) => (
              <li key={r.path}>
                <a className="text-accent underline" href={mediaURL(projectId, r.path)}>
                  {r.path}
                </a>
                {r.size ? <span className="text-text-3"> · {fmtBytes(r.size)}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
