import type { InputReference, MusicTrack, ProjectInputs, UploadLimits } from "@/types/api";
import { v1 } from "./endpoints";
import {
  api,
  ApiError,
  getSession,
  parseBody,
  resetSession,
  TOKEN_HEADER,
  toApiError,
} from "./http";

export const getUploadLimits = () => api<UploadLimits>(v1.uploadLimits);

export const listInputs = (projectId: string) => api<ProjectInputs>(v1.project(projectId).inputs);

/** Refused with 409 `already_started` once the agent has written a checkpoint. */
export const removeUpload = (projectId: string, name: string) =>
  api<null>(v1.project(projectId).uploadFile(name), { method: "DELETE" });

export const addReference = (projectId: string, ref: { url: string; notes: string }) =>
  api<InputReference>(v1.project(projectId).references, { json: ref });

export const removeReference = (projectId: string, refId: string) =>
  api<null>(v1.project(projectId).reference(refId), { method: "DELETE" });

export const listMusic = () => api<{ tracks: MusicTrack[] }>(v1.music);

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
        reject(toApiError(xhr.status, body, url));
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
