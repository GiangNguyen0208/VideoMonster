/**
 * The app's single upload queue and the hooks around it. The queue itself is
 * `UploadQueue` (uploadQueue.ts); this module binds it to the real sender and
 * to React Query so finished files show up in their lists.
 */
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { queryKeys } from "@/hooks/api/queryKeys";
import { sendFile } from "@/services/uploads";
import type { UploadKind } from "@/types/api";
import { MUSIC_TARGET, UploadQueue, type Sender, type UploadItem } from "./uploadQueue";

export { isActive, MUSIC_TARGET, type UploadItem, type UploadState } from "./uploadQueue";

export const uploadQueue = new UploadQueue(sendFile);

export function enqueueUploads(target: string, list: File[], kind: UploadKind = "footage") {
  uploadQueue.enqueue(target, list, kind);
}

/** Cancel a queued or running upload (the server drops the partial file). */
export function cancelUpload(id: string) {
  uploadQueue.cancel(id);
}

export function dismissUpload(id: string) {
  uploadQueue.dismiss(id);
}

/** Live upload list for one target. */
export function useUploads(target: string): UploadItem[] {
  const all = useSyncExternalStore(uploadQueue.subscribe, uploadQueue.getSnapshot);
  return all.filter((it) => it.target === target);
}

/**
 * A finished upload is in its server list now: refresh that list, then drop
 * the progress rows it replaces. Returns the target's live uploads.
 */
export function useUploadsSync(target: string): UploadItem[] {
  const queryClient = useQueryClient();
  const uploads = useUploads(target);
  const doneCount = uploads.filter((u) => u.state === "done").length;
  useEffect(() => {
    if (doneCount === 0) return;
    const key: QueryKey = target === MUSIC_TARGET ? queryKeys.music : queryKeys.inputs(target);
    void queryClient.invalidateQueries({ queryKey: key }).then(() => {
      for (const u of uploads) if (u.state === "done") uploadQueue.dismiss(u.id);
    });
  }, [doneCount, target, queryClient, uploads]);
  return uploads;
}

/** Tests swap the network sender; `reset` clears every queue. */
export const __testing = {
  setSender(fn: Sender) {
    uploadQueue.setSender(fn);
  },
  reset() {
    uploadQueue.reset(sendFile);
  },
};
