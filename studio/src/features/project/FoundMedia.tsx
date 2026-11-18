import { Card } from "@/components/ui";
import { useT } from "@/i18n";
import { MediaThumb } from "@/components/MediaThumb";
import { isVideo } from "@/utils/format";

/** Snapshots found in a project that has no pipeline state (CLI or legacy runs). */
export function FoundMedia({
  projectId,
  snapshots,
}: {
  projectId: string;
  snapshots: { path: string }[];
}) {
  const t = useT();
  const L = t.project.foundMedia;
  if (!snapshots.length) return null;
  return (
    <Card className="space-y-3" role="region" aria-label={L.title}>
      <div>
        <h2 className="font-semibold">{L.title}</h2>
        <p className="text-sm text-text-2">{L.body}</p>
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {snapshots.slice(0, 12).map((s) => (
          <li key={s.path} className="aspect-video overflow-hidden rounded-control bg-black">
            {isVideo(s.path) ? null : (
              <MediaThumb
                projectId={projectId}
                path={s.path}
                width={320}
                alt={s.path}
                className="size-full object-cover"
              />
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
