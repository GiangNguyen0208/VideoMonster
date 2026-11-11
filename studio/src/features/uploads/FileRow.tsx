import { useEffect, useRef, useState, type ReactNode } from "react";
import { Film, Music, Trash2 } from "@/components/icons";
import { Badge } from "@/components/ui";
import { useT } from "@/i18n";
import type { MediaKind } from "@/types/api";
import { isActive, type UploadItem } from "./uploadStore";

/** One file: name, facts, optional preview, and its upload or problem state. */
export function FileRow({
  name,
  media,
  meta,
  issue,
  upload,
  preview,
  onRemove,
  removeLabel,
  tag,
}: {
  name: string;
  media: MediaKind | null;
  meta?: string;
  issue?: string | null;
  upload?: UploadItem;
  /** Rendered only once the user opens the preview. */
  preview?: () => ReactNode;
  onRemove?: () => void;
  removeLabel?: string;
  tag?: string;
}) {
  const t = useT();
  const L = t.uploads;
  const [open, setOpen] = useState(false);
  const pct = upload && upload.size ? Math.round((upload.loaded / upload.size) * 100) : 0;

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-control bg-surface-high text-text-2"
        >
          {media === "audio" ? <Music className="size-4" /> : <Film className="size-4" />}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium" title={name}>
          {name}
        </span>
        {tag && <Badge tone="info">{tag}</Badge>}
        {media && <Badge>{L.media[media] ?? media}</Badge>}
        {meta && <span className="font-mono text-xs text-text-2">{meta}</span>}
        {preview && !upload && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="text-sm text-accent underline"
          >
            {L.preview}
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={removeLabel}
            className="grid size-8 place-items-center rounded-control text-text-2 hover:bg-danger-dim hover:text-danger"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        )}
      </div>
      {upload && (
        <div className="space-y-1">
          {isActive(upload) && (
            <progress
              className="h-1.5 w-full overflow-hidden rounded-full accent-accent"
              max={100}
              value={pct}
              aria-label={L.progress(name)}
            />
          )}
          <p className={upload.state === "error" ? "text-xs text-danger" : "text-xs text-text-3"}>
            {upload.state === "uploading" ? L.states.uploading(pct) : L.states[upload.state]}
            {upload.state === "error" && issue ? ` — ${issue}` : ""}
          </p>
        </div>
      )}
      {!upload && issue && (
        <p role="alert" className="text-xs text-danger">
          {issue}
        </p>
      )}
      {open && preview && <div className="max-w-md">{preview()}</div>}
    </li>
  );
}

/** <video>/<audio>/<img> for a URL by media kind. */
export function MediaPreview({
  src,
  media,
  name,
}: {
  src: string;
  media: MediaKind;
  name: string;
}) {
  if (media === "video") {
    return <video src={src} controls preload="metadata" className="w-full rounded-control" />;
  }
  if (media === "audio") return <audio src={src} controls preload="metadata" className="w-full" />;
  if (media === "image") return <img src={src} alt={name} className="max-h-64 rounded-control" />;
  return null;
}

/** Preview of a local file before upload; the object URL lives as long as the element. */
export function BlobPreview({ file, media }: { file: File; media: MediaKind }) {
  const ref = useRef<HTMLVideoElement & HTMLAudioElement & HTMLImageElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const url = URL.createObjectURL(file);
    el.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  if (media === "video") {
    return <video ref={ref} controls preload="metadata" className="w-full rounded-control" />;
  }
  if (media === "audio") return <audio ref={ref} controls preload="metadata" className="w-full" />;
  if (media === "image")
    return <img ref={ref} alt={file.name} className="max-h-64 rounded-control" />;
  return null;
}
