/** Pure helpers for picking, checking and describing media files. */
import { msg } from "@/i18n";
import type { MediaKind, UploadLimits } from "@/lib/api";
import { fmtBytes, fmtDuration } from "@/lib/format";

export const ALL_KINDS: MediaKind[] = ["video", "audio", "image", "subtitle"];

export function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

export function kindOf(name: string, limits: UploadLimits | undefined): MediaKind | null {
  const ext = extOf(name);
  if (!limits || !ext) return null;
  return ALL_KINDS.find((k) => limits.extensions[k]?.includes(ext)) ?? null;
}

/** `accept` attribute for a file input. */
export function acceptAttr(kinds: MediaKind[], limits: UploadLimits | undefined): string {
  return limits ? kinds.flatMap((k) => limits.extensions[k] ?? []).join(",") : "";
}

/** Blocking problem the server would refuse anyway, as a localized sentence. */
export function fileIssue(
  file: File,
  kinds: MediaKind[],
  limits: UploadLimits | undefined,
): string | null {
  if (!limits) return null;
  const kind = kindOf(file.name, limits);
  if (!kind || !kinds.includes(kind)) return msg().uploads.errors.unsupported_type!;
  if (file.size > limits.max_bytes) return msg().uploads.tooLarge(fmtBytes(limits.max_bytes));
  if (file.size === 0) return msg().uploads.errors.empty_file!;
  return null;
}

/** Upload error code from the server or the store → sentence. */
export function uploadErrorText(code: string | null, limits?: UploadLimits): string {
  const L = msg().uploads;
  if (code === "too_large" && limits) return L.tooLarge(fmtBytes(limits.max_bytes));
  if (code === "http_422") return L.errors.bad_url!;
  return (code && L.errors[code]) || L.errors.network!;
}

/** Media length in seconds read by the browser; null when it can't tell. */
export function readDuration(file: File): Promise<number | null> {
  if (typeof URL.createObjectURL !== "function") return Promise.resolve(null);
  const type = file.type.startsWith("audio/") ? "audio" : "video";
  if (!/^(audio|video)\//.test(file.type)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const el = document.createElement(type);
    const url = URL.createObjectURL(file);
    const done = (value: number | null) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      el.removeAttribute("src");
      resolve(value);
    };
    const timer = setTimeout(() => done(null), 8000);
    el.preload = "metadata";
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? el.duration : null);
    el.onerror = () => done(null);
    el.src = url;
  });
}

/** "4:05" style length plus "1920×1080" when known. */
export function describeMedia(f: {
  size: number;
  duration_s?: number | null;
  width?: number | null;
  height?: number | null;
}): string {
  return [
    fmtBytes(f.size),
    f.duration_s ? fmtDuration(f.duration_s) : null,
    f.width && f.height ? `${f.width}×${f.height}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** "5 min" / "30 s" for a minimum length. */
export function fmtLength(seconds: number): string {
  return seconds >= 60 ? `${Math.round(seconds / 60)} min` : `${seconds} s`;
}
