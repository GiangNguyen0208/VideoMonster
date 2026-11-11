/**
 * Every URL the Studio talks to, in one place. Paths are relative to the
 * Backlot origin (the Vite dev server proxies `/api`, `/media` and `/thumb`).
 */
import type { UploadKind } from "@/types/api";

const enc = encodeURIComponent;
const V1 = "/api/v1";

/** Encode each segment of a project-relative path but keep the slashes. */
export const encodePath = (rel: string) => rel.split("/").map(enc).join("/");

/** Backlot read API (unversioned, shared with the classic board). */
export const board = {
  projects: "/api/projects",
  state: (id: string) => `/api/project/${enc(id)}/state`,
  projectEvents: (id: string) => `/api/project/${enc(id)}/events`,
  libraryEvents: "/api/library/events",
};

/** Studio write API. */
export const v1 = {
  session: `${V1}/session`,
  job: (id: string) => `${V1}/jobs/${enc(id)}`,
  setup: `${V1}/setup`,
  setupRecheck: `${V1}/setup/recheck`,
  setupEnv: `${V1}/setup/env`,
  pipelines: `${V1}/pipelines`,
  styles: `${V1}/styles`,
  projects: `${V1}/projects`,
  uploadLimits: `${V1}/uploads/limits`,
  music: `${V1}/music`,
  musicUpload: (name: string) => `${V1}/music?name=${enc(name)}`,
  musicTrack: (name: string) => `${V1}/music/tracks/${encodePath(name)}`,
  costSummary: (since: string) => `${V1}/cost/summary?since=${enc(since)}`,
  settings: `${V1}/settings`,
  demos: `${V1}/demos`,
  demoRender: (name: string) => `${V1}/demos/${enc(name)}/render`,
  project: (id: string) => {
    const base = `${V1}/projects/${enc(id)}`;
    return {
      intake: `${base}/intake`,
      kickoff: `${base}/kickoff`,
      decisions: `${base}/decisions`,
      decision: (decisionId: string) => `${base}/decisions/${enc(decisionId)}`,
      inputs: `${base}/inputs`,
      upload: (name: string, kind: UploadKind = "footage") =>
        `${base}/uploads?name=${enc(name)}&kind=${kind}`,
      uploadFile: (name: string) => `${base}/uploads/${enc(name)}`,
      references: `${base}/references`,
      reference: (refId: string) => `${base}/references/${enc(refId)}`,
      results: `${base}/results`,
      export: `${base}/export`,
      cost: `${base}/cost`,
    };
  },
};

/** Project media served by Backlot (`/media/<id>/<path>`). */
export function mediaURL(projectId: string, relPath: string): string {
  return `/media/${enc(projectId)}/${encodePath(relPath)}`;
}

/** Cached downscaled JPEG (images and video poster frames). */
export function thumbURL(projectId: string, relPath: string, width = 640): string {
  return `/thumb/${enc(projectId)}/${encodePath(relPath)}?w=${width}`;
}

/** `/media` URL that the browser saves instead of playing. */
export function downloadURL(projectId: string, relPath: string): string {
  return `${mediaURL(projectId, relPath)}?download=1`;
}
