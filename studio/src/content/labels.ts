/**
 * Engine term → plain-language label (docs/ui-plan/02-use-cases.md §5.1).
 * Texts live in the i18n catalogs (`labels`); unknown names fall back to a
 * title-cased version, never the raw id.
 */
import { msg } from "@/i18n";

export function titleCase(id: string): string {
  return id
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function stageLabel(name: string): string {
  return msg().labels.stages[name] ?? titleCase(name);
}

export function videoTypeLabel(pipelineType: string | null | undefined): string {
  const labels = msg().labels;
  if (!pipelineType || pipelineType === "unknown") return labels.customProduction;
  return labels.videoTypes[pipelineType] ?? titleCase(pipelineType);
}

export function capabilityLabel(id: string): string {
  return msg().labels.capabilities[id] ?? titleCase(id);
}

export const RUNTIME_LABELS: Record<string, string> = {
  ffmpeg: "FFmpeg",
  remotion: "Remotion",
  hyperframes: "HyperFrames",
};

/** Most meaningful capabilities first — what a newcomer cares about. */
const CAPABILITY_PRIORITY = [
  "tts",
  "image_generation",
  "video_generation",
  "music_generation",
  "avatar",
  "video_post",
  "subtitle",
  "audio_processing",
  "sound_effects",
  "music_search",
  "screen_capture",
];

export function byCapabilityPriority(a: string, b: string): number {
  const rank = (id: string) => {
    const i = CAPABILITY_PRIORITY.indexOf(id);
    return i === -1 ? CAPABILITY_PRIORITY.length : i;
  };
  return rank(a) - rank(b) || capabilityLabel(a).localeCompare(capabilityLabel(b));
}

/** Provider ids that carry no meaning for a user ("local", "multi", ...). */
export const GENERIC_PROVIDERS = new Set(["local", "multi", "openmontage", "selector"]);
