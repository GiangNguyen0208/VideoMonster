import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useT } from "@/i18n";
import { musicKey, musicTrackUrl, useMusic, useUploadLimits } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fmtBytes, fmtDuration } from "@/lib/format";
import { DropZone } from "@/features/uploads/DropZone";
import { FileRow } from "@/features/uploads/FileRow";
import { acceptAttr, uploadErrorText } from "@/features/uploads/media";
import {
  dismissUpload,
  enqueueUploads,
  isActive,
  MUSIC_TARGET,
  cancelUpload,
  useUploads,
} from "@/features/uploads/uploadStore";

/**
 * Pick a track from music_library/ (shared by every project), with a
 * one-at-a-time preview player and uploads into the library.
 * `value` is the track name; "" means "let the agent choose".
 */
export function MusicPicker({
  value,
  onChange,
  allowAgentChoice = true,
}: {
  value: string;
  onChange: (track: string) => void;
  allowAgentChoice?: boolean;
}) {
  const t = useT();
  const L = t.music;
  const queryClient = useQueryClient();
  const tracks = useMusic().data ?? [];
  const limits = useUploadLimits().data;
  const uploads = useUploads(MUSIC_TARGET);
  const doneCount = uploads.filter((u) => u.state === "done").length;
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (doneCount === 0) return;
    void queryClient.invalidateQueries({ queryKey: musicKey }).then(() => {
      for (const u of uploads) if (u.state === "done") dismissUpload(u.id);
    });
  }, [doneCount, queryClient, uploads]);

  useEffect(() => () => audio.current?.pause(), []);

  const toggle = (name: string) => {
    audio.current?.pause();
    if (playing === name) {
      setPlaying(null);
      return;
    }
    const el = new Audio(musicTrackUrl(name));
    el.onended = () => setPlaying(null);
    audio.current = el;
    setPlaying(name);
    void el.play()?.catch(() => setPlaying(null));
  };

  const option = (selected: boolean) =>
    cn(
      "flex-1 rounded-control px-3 py-2 text-left text-sm transition",
      selected ? "bg-accent-dim font-medium text-accent" : "hover:bg-surface-2",
    );

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border-soft rounded-card border border-border-soft">
        {allowAgentChoice && (
          <li className="flex p-1">
            <button
              type="button"
              aria-pressed={value === ""}
              onClick={() => onChange("")}
              className={option(value === "")}
            >
              {L.agentChooses}
            </button>
          </li>
        )}
        {tracks.map((tr) => (
          <li key={tr.name} className="flex items-center gap-2 p-1">
            <button
              type="button"
              onClick={() => toggle(tr.name)}
              aria-label={playing === tr.name ? L.pause(tr.title) : L.play(tr.title)}
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-text-2 hover:bg-surface-2"
            >
              {playing === tr.name ? "❚❚" : "▶"}
            </button>
            <button
              type="button"
              aria-pressed={value === tr.name}
              onClick={() => onChange(tr.name)}
              className={option(value === tr.name)}
            >
              {tr.title}
              <span className="ml-2 text-xs font-normal text-text-3">
                {[fmtDuration(tr.duration_s), fmtBytes(tr.size)].filter(Boolean).join(" · ")}
              </span>
            </button>
          </li>
        ))}
        {tracks.length === 0 && <li className="px-4 py-3 text-sm text-text-3">{L.empty}</li>}
      </ul>
      {uploads.filter((u) => u.state !== "done").length > 0 && (
        <ul className="divide-y divide-border-soft rounded-card border border-border-soft">
          {uploads
            .filter((u) => u.state !== "done")
            .map((u) => (
              <FileRow
                key={u.id}
                name={u.name}
                media="audio"
                upload={u}
                issue={u.state === "error" ? uploadErrorText(u.error, limits) : null}
                onRemove={() => (isActive(u) ? cancelUpload(u.id) : dismissUpload(u.id))}
                removeLabel={isActive(u) ? t.uploads.cancel(u.name) : t.uploads.dismiss}
              />
            ))}
        </ul>
      )}
      <DropZone
        compact
        label={L.add}
        accept={acceptAttr(["audio"], limits)}
        onFiles={(list) => enqueueUploads(MUSIC_TARGET, list)}
      />
    </div>
  );
}
