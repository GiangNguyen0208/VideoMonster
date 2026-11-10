import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, getSession, resetSession, TOKEN_HEADER } from "./client";
import { queryKeys } from "./queries";

export type MediaKind = "video" | "audio" | "image" | "subtitle";
export type UploadKind = "footage" | "reference";

export interface UploadLimits {
  max_bytes: number;
  extensions: Record<MediaKind, string[]>;
}

export interface InputFile {
  path: string;
  name: string;
  kind: UploadKind;
  media: MediaKind;
  size: number;
  duration_s: number | null;
  width: number | null;
  height: number | null;
  codec: string | null;
  uploaded_at: string;
}

export interface InputReference {
  id: string;
  url: string;
  notes: string | null;
  added_at: string;
  source: string;
}

export interface ProjectInputs {
  files: InputFile[];
  references: InputReference[];
  /** The agent has written a checkpoint: removing inputs is no longer allowed. */
  started: boolean;
}

export interface MusicTrack {
  name: string;
  title: string;
  size: number;
  duration_s: number | null;
}

const enc = encodeURIComponent;
const inputsUrl = (projectId: string) => `/api/v1/projects/${enc(projectId)}`;
export const musicKey = ["music"] as const;

export function uploadUrl(projectId: string, name: string, kind: UploadKind = "footage") {
  return `${inputsUrl(projectId)}/uploads?name=${enc(name)}&kind=${kind}`;
}

export function musicUploadUrl(name: string) {
  return `/api/v1/music?name=${enc(name)}`;
}

export function musicTrackUrl(name: string) {
  return `/api/v1/music/tracks/${name.split("/").map(enc).join("/")}`;
}

export function useUploadLimits() {
  return useQuery({
    queryKey: ["upload-limits"],
    queryFn: () => api<UploadLimits>("/api/v1/uploads/limits"),
    staleTime: Infinity,
  });
}

export function useInputs(projectId: string) {
  return useQuery({
    queryKey: queryKeys.inputs(projectId),
    queryFn: () => api<ProjectInputs>(`${inputsUrl(projectId)}/inputs`),
    enabled: Boolean(projectId),
  });
}

export function useRemoveUpload(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api<null>(`${inputsUrl(projectId)}/uploads/${enc(name)}`, { method: "DELETE" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.inputs(projectId) }),
  });
}

export function useAddReference(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ref: { url: string; notes: string }) =>
      api<InputReference>(`${inputsUrl(projectId)}/references`, { json: ref }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.inputs(projectId) }),
  });
}

export function useRemoveReference(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<null>(`${inputsUrl(projectId)}/references/${enc(id)}`, { method: "DELETE" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.inputs(projectId) }),
  });
}

export function useMusic() {
  return useQuery({
    queryKey: musicKey,
    queryFn: () => api<{ tracks: MusicTrack[] }>("/api/v1/music"),
    select: (d) => d.tracks,
  });
}

/**
 * POST a file as the raw request body. XMLHttpRequest instead of fetch:
 * only XHR reports upload progress. Retries once with a fresh session
 * token after a 403, like `api()`.
 */
export async function sendFile<T>(
  url: string,
  file: Blob,
  onProgress: (loaded: number) => void,
  signal?: AbortSignal,
): Promise<T> {
  const attempt = async (): Promise<T> => {
    const token = (await getSession()).token;
    return new Promise<T>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      xhr.setRequestHeader(TOKEN_HEADER, token);
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      xhr.upload.onprogress = (e) => onProgress(e.loaded);
      xhr.onload = () => {
        const body = parseBody(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(file.size);
          resolve(body as T);
          return;
        }
        const obj = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
        reject(
          new ApiError(
            xhr.status,
            obj.detail ?? body,
            url,
            typeof obj.code === "string" ? obj.code : null,
          ),
        );
      };
      xhr.onerror = () => reject(new Error("network"));
      xhr.onabort = () => reject(new DOMException("aborted", "AbortError"));
      signal?.addEventListener("abort", () => xhr.abort(), { once: true });
      xhr.send(file);
    });
  };
  try {
    return await attempt();
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      resetSession();
      return attempt();
    }
    throw err;
  }
}

function parseBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
