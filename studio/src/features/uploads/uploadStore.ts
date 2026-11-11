/**
 * Uploads that outlive the page that started them: the wizard queues the
 * footage, navigates to the new project, and the project page shows the same
 * progress. One file at a time per target (a project id or the music library).
 */
import { useSyncExternalStore } from "react";
import { ApiError, musicUploadUrl, sendFile, uploadUrl, type UploadKind } from "@/lib/api";

export const MUSIC_TARGET = "__music__";

export type UploadState = "queued" | "uploading" | "done" | "error";

export interface UploadItem {
  id: string;
  target: string;
  name: string;
  size: number;
  loaded: number;
  state: UploadState;
  /** Server error code (`too_large`, `unsupported_type`, …) or `network`. */
  error: string | null;
}

type Sender = (
  url: string,
  file: Blob,
  onProgress: (loaded: number) => void,
  signal: AbortSignal,
) => Promise<unknown>;

let items: UploadItem[] = [];
const files = new Map<string, File>();
const aborts = new Map<string, AbortController>();
const kinds = new Map<string, UploadKind>();
const listeners = new Set<() => void>();
const running = new Set<string>();
let sender: Sender = sendFile;
let seq = 0;

function emit() {
  for (const l of listeners) l();
}

function patch(id: string, change: Partial<UploadItem>) {
  items = items.map((it) => (it.id === id ? { ...it, ...change } : it));
  emit();
}

function urlFor(item: UploadItem): string {
  return item.target === MUSIC_TARGET
    ? musicUploadUrl(item.name)
    : uploadUrl(item.target, item.name, kinds.get(item.id) ?? "footage");
}

async function pump(target: string) {
  if (running.has(target)) return;
  running.add(target);
  try {
    for (;;) {
      const next = items.find((it) => it.target === target && it.state === "queued");
      if (!next) break;
      const file = files.get(next.id)!;
      const abort = new AbortController();
      aborts.set(next.id, abort);
      patch(next.id, { state: "uploading", loaded: 0 });
      try {
        await sender(urlFor(next), file, (loaded) => patch(next.id, { loaded }), abort.signal);
        patch(next.id, { state: "done", loaded: next.size });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          items = items.filter((it) => it.id !== next.id);
          emit();
        } else {
          patch(next.id, {
            state: "error",
            error: err instanceof ApiError ? (err.code ?? `http_${err.status}`) : "network",
          });
        }
      } finally {
        aborts.delete(next.id);
        files.delete(next.id);
      }
    }
  } finally {
    running.delete(target);
  }
}

export function enqueueUploads(target: string, list: File[], kind: UploadKind = "footage") {
  for (const file of list) {
    const id = `u${++seq}`;
    files.set(id, file);
    kinds.set(id, kind);
    items = [
      ...items,
      { id, target, name: file.name, size: file.size, loaded: 0, state: "queued", error: null },
    ];
  }
  emit();
  void pump(target);
}

/** Cancel a queued or running upload (the server drops the partial file). */
export function cancelUpload(id: string) {
  const abort = aborts.get(id);
  if (abort) {
    abort.abort();
    return;
  }
  files.delete(id);
  items = items.filter((it) => it.id !== id);
  emit();
}

export function dismissUpload(id: string) {
  items = items.filter((it) => it.id !== id);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Live upload list for one target. */
export function useUploads(target: string): UploadItem[] {
  const all = useSyncExternalStore(subscribe, () => items);
  return all.filter((it) => it.target === target);
}

export function isActive(item: UploadItem) {
  return item.state === "queued" || item.state === "uploading";
}

/** Tests swap the network sender; `reset` clears every queue. */
export const __testing = {
  setSender(fn: Sender) {
    sender = fn;
  },
  reset() {
    for (const a of aborts.values()) a.abort();
    items = [];
    files.clear();
    aborts.clear();
    kinds.clear();
    running.clear();
    sender = sendFile;
    emit();
  },
};
