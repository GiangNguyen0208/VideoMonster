import { Badge, EmptyState } from "@/components/ui";
import { titleCase } from "@/content/labels";
import { useT } from "@/i18n";
import type { MediaItem, Scene, Storyboard } from "@/types/api";
import { fmtDuration, isAudio, isVideo } from "@/utils/format";
import { mediaURL, thumbURL } from "@/services";

/** Scene × narration × assets filmstrip (same join the classic board shows). */
export function StoryboardView({
  projectId,
  storyboard,
}: {
  projectId: string;
  storyboard: Storyboard | null;
}) {
  const t = useT();
  const scenes = storyboard?.scenes ?? [];
  if (!scenes.length) {
    return (
      <EmptyState title={t.project.storyboard.emptyTitle}>
        {t.project.storyboard.emptyBody}
      </EmptyState>
    );
  }
  return (
    <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {scenes.map((scene, i) => (
        <SceneCard key={scene.id} projectId={projectId} scene={scene} index={i} />
      ))}
    </ol>
  );
}

function SceneCard({
  projectId,
  scene,
  index,
}: {
  projectId: string;
  scene: Scene;
  index: number;
}) {
  const t = useT();
  const L = t.project.storyboard;
  const visual = scene.visual && scene.visual.exists !== false ? scene.visual : null;
  const takes = scene.takes?.length ?? 0;
  const audio = (scene.audio ?? []).find((a) => a.exists !== false && isAudio(a.path));
  const duration =
    scene.duration_seconds ??
    (scene.end_seconds != null && scene.start_seconds != null
      ? scene.end_seconds - scene.start_seconds
      : null);

  return (
    <li className="overflow-hidden rounded-card border border-border bg-surface">
      <div className="relative aspect-video bg-black">
        <SceneVisual projectId={projectId} visual={visual} />
        {scene.generating && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm text-white">
            {L.generating(scene.generating_tool ? titleCase(scene.generating_tool) : null)}
          </span>
        )}
        <span className="absolute top-2 left-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-xs text-white">
          {index + 1}
          {duration != null ? ` · ${fmtDuration(duration)}` : ""}
        </span>
      </div>
      <div className="space-y-2 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {scene.section_label && <p className="text-sm font-medium">{scene.section_label}</p>}
          {scene.hero_moment && <Badge tone="accent">{L.heroMoment}</Badge>}
          {takes > 1 && <Badge>{L.takes(takes)}</Badge>}
        </div>
        {scene.description && scene.description !== scene.section_label && (
          <p className="text-sm text-text-2">{scene.description}</p>
        )}
        {scene.narration && (
          <p className="border-l-2 border-accent/50 pl-2 text-sm text-text italic">
            “{scene.narration}”
          </p>
        )}
        {audio && (
          <audio
            controls
            preload="none"
            src={mediaURL(projectId, audio.path)}
            className="h-8 w-full"
            aria-label={L.narrationFor(index + 1)}
          />
        )}
      </div>
    </li>
  );
}

function SceneVisual({ projectId, visual }: { projectId: string; visual: MediaItem | null }) {
  const t = useT();
  if (!visual?.path) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-white/50">
        {t.project.storyboard.noVisual}
      </div>
    );
  }
  if (isVideo(visual.path)) {
    return (
      <video
        src={mediaURL(projectId, visual.path)}
        poster={thumbURL(projectId, visual.path)}
        preload="none"
        muted
        controls
        className="h-full w-full object-cover"
      />
    );
  }
  return (
    <img
      src={thumbURL(projectId, visual.path)}
      alt={visual.prompt ?? ""}
      loading="lazy"
      className="h-full w-full object-cover"
    />
  );
}
