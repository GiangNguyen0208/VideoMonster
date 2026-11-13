import { useState } from "react";
import { MediaThumb } from "@/components/MediaThumb";
import { Badge, Dialog, EmptyState, selectableClass } from "@/components/ui";
import { titleCase } from "@/content/labels";
import { useT } from "@/i18n";
import type { MediaItem, Scene, Storyboard } from "@/types/api";
import { cn } from "@/utils/cn";
import { fmtDuration, isAudio, isVideo } from "@/utils/format";
import { mediaURL, thumbURL } from "@/services";

/** Scene × narration × assets filmstrip (scenes joined with their narration and assets). */
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
  const [picked, setPicked] = useState<number | null>(null);
  const [zoom, setZoom] = useState(false);
  const takeList = scene.takes ?? [];
  const takes = takeList.length;
  const candidate = picked !== null ? takeList[picked] : scene.visual;
  const visual = candidate && candidate.exists !== false ? candidate : null;
  const audio = (scene.audio ?? []).find((a) => a.exists !== false && isAudio(a.path));
  const duration =
    scene.duration_seconds ??
    (scene.end_seconds != null && scene.start_seconds != null
      ? scene.end_seconds - scene.start_seconds
      : null);

  return (
    <li className="overflow-hidden rounded-card border border-border bg-surface">
      <div className="relative aspect-video bg-black">
        <SceneVisual
          projectId={projectId}
          visual={visual}
          onZoom={visual && !isVideo(visual.path) ? () => setZoom(true) : undefined}
        />
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
        {takes > 1 && (
          <div role="group" aria-label={L.takesLabel(index + 1)} className="flex flex-wrap gap-1.5">
            {takeList.map((take, n) => {
              const active =
                picked === null
                  ? take.path === scene.visual?.path || take.id === scene.visual?.id
                  : picked === n;
              return (
                <button
                  key={take.id ?? take.path}
                  type="button"
                  aria-pressed={active}
                  aria-label={L.takeN(n + 1)}
                  onClick={() => setPicked(n)}
                  className={cn(
                    "grid size-11 place-items-center overflow-hidden rounded-control border text-xs",
                    selectableClass(active),
                  )}
                >
                  {take.exists !== false &&
                  take.path &&
                  !isVideo(take.path) &&
                  !isAudio(take.path) ? (
                    <MediaThumb
                      projectId={projectId}
                      path={take.path}
                      width={320}
                      fallback={n + 1}
                      className="size-full object-cover"
                    />
                  ) : (
                    n + 1
                  )}
                </button>
              );
            })}
          </div>
        )}
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
      {visual && !isVideo(visual.path) && (
        <Dialog open={zoom} onClose={() => setZoom(false)} title={L.sceneN(index + 1)}>
          <img
            src={mediaURL(projectId, visual.path)}
            alt={visual.prompt ?? L.sceneN(index + 1)}
            className="max-h-[70dvh] w-full object-contain"
          />
          {visual.prompt && <p className="mt-3 text-sm text-text-2">{visual.prompt}</p>}
        </Dialog>
      )}
    </li>
  );
}

function SceneVisual({
  projectId,
  visual,
  onZoom,
}: {
  projectId: string;
  visual: MediaItem | null;
  onZoom?: () => void;
}) {
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
  const img = (
    <MediaThumb
      projectId={projectId}
      path={visual.path}
      alt={visual.prompt ?? ""}
      className="h-full w-full object-cover"
    />
  );
  if (!onZoom) return img;
  return (
    <button
      type="button"
      onClick={onZoom}
      aria-label={t.project.storyboard.enlarge}
      className="block h-full w-full cursor-zoom-in"
    >
      {img}
    </button>
  );
}
