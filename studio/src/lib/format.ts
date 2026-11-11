/** Formatting + URL helpers — ports of backlot/ui/lib.js so both UIs agree. */
import { getLocale, msg } from "@/i18n";

/** USD in the UI language's format: "$1,234.50" (en) / "1.234,50 US$" (vi). */
export function fmtMoney(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat(getLocale(), {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: Math.abs(v) > 0 && Math.abs(v) < 0.01 ? 4 : 2,
  }).format(v);
}

export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "";
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function fmtAgo(epochSeconds: number | null | undefined, now = Date.now()): string {
  if (!epochSeconds) return "";
  const diff = now / 1000 - epochSeconds;
  const t = msg().time;
  if (diff < 90) return t.justNow;
  if (diff < 3600) return t.minutesAgo(Math.round(diff / 60));
  if (diff < 86400) return t.hoursAgo(Math.round(diff / 3600));
  return t.daysAgo(Math.round(diff / 86400));
}

export function fmtClock(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(getLocale(), {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Byte size in the UI language's number format ("1.5 MB" / "1,5 MB"). */
export function fmtBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  const num = (v: number, digits: number) =>
    v.toLocaleString(getLocale(), { maximumFractionDigits: digits });
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${num(n / 1024, 0)} KB`;
  if (n < 1024 ** 3) return `${num(n / 1024 ** 2, 1)} MB`;
  return `${num(n / 1024 ** 3, 2)} GB`;
}

const encPath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

export function mediaURL(projectId: string, relPath: string): string {
  return `/media/${encodeURIComponent(projectId)}/${encPath(relPath)}`;
}

/** Cached downscaled JPEG (images and video poster frames). */
export function thumbURL(projectId: string, relPath: string, width = 640): string {
  return `/thumb/${encodeURIComponent(projectId)}/${encPath(relPath)}?w=${width}`;
}

export function isVideo(path: string): boolean {
  return /\.(mp4|webm|mov)$/i.test(path);
}

export function isAudio(path: string): boolean {
  return /\.(mp3|wav|m4a|aac|flac|ogg|opus)$/i.test(path);
}
