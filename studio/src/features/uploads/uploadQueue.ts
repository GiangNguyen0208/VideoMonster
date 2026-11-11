/**
 * Upload queue that outlives the page that started it: the wizard queues the
 * footage, navigates to the new project, and the project page shows the same
 * progress. One file at a time per target (a project id or the music library).
 */
import { v1 } from "@/services/endpoints";
import { ApiError } from "@/services/http";
import type { UploadKind } from "@/types/api";

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

/** Sends one file; `sendFile` in production, a fake in tests. */
export type Sender = (
  url: string,
  file: Blob,
  onProgress: (loaded: number) => void,
  signal: AbortSignal,
) => Promise<unknown>;

export function isActive(item: UploadItem) {
  return item.state === "queued" || item.state === "uploading";
}

export class UploadQueue {
  private items: UploadItem[] = [];
  private readonly files = new Map<string, File>();
  private readonly kinds = new Map<string, UploadKind>();
  private readonly aborts = new Map<string, AbortController>();
  private readonly running = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private seq = 0;

  constructor(private send: Sender) {}

  /** Snapshot for `useSyncExternalStore`; a new array after every change. */
  getSnapshot = (): UploadItem[] => this.items;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  enqueue(target: string, list: File[], kind: UploadKind = "footage"): void {
    for (const file of list) {
      const id = `u${++this.seq}`;
      this.files.set(id, file);
      this.kinds.set(id, kind);
      this.items = [
        ...this.items,
        { id, target, name: file.name, size: file.size, loaded: 0, state: "queued", error: null },
      ];
    }
    this.emit();
    void this.pump(target);
  }

  /** Cancel a queued or running upload (the server drops the partial file). */
  cancel(id: string): void {
    const abort = this.aborts.get(id);
    if (abort) {
      abort.abort();
      return;
    }
    this.files.delete(id);
    this.remove(id);
  }

  dismiss(id: string): void {
    this.remove(id);
  }

  /** Abort everything and forget all items (tests); optionally swap the sender. */
  reset(send?: Sender): void {
    for (const a of this.aborts.values()) a.abort();
    this.items = [];
    this.files.clear();
    this.kinds.clear();
    this.aborts.clear();
    this.running.clear();
    if (send) this.send = send;
    this.emit();
  }

  setSender(send: Sender): void {
    this.send = send;
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  private remove(id: string) {
    this.items = this.items.filter((it) => it.id !== id);
    this.emit();
  }

  private patch(id: string, change: Partial<UploadItem>) {
    this.items = this.items.map((it) => (it.id === id ? { ...it, ...change } : it));
    this.emit();
  }

  private urlFor(item: UploadItem): string {
    return item.target === MUSIC_TARGET
      ? v1.musicUpload(item.name)
      : v1.project(item.target).upload(item.name, this.kinds.get(item.id) ?? "footage");
  }

  private async pump(target: string) {
    if (this.running.has(target)) return;
    this.running.add(target);
    try {
      for (;;) {
        const next = this.items.find((it) => it.target === target && it.state === "queued");
        if (!next) break;
        const file = this.files.get(next.id)!;
        const abort = new AbortController();
        this.aborts.set(next.id, abort);
        this.patch(next.id, { state: "uploading", loaded: 0 });
        try {
          await this.send(
            this.urlFor(next),
            file,
            (loaded) => this.patch(next.id, { loaded }),
            abort.signal,
          );
          this.patch(next.id, { state: "done", loaded: next.size });
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") {
            this.remove(next.id);
          } else {
            this.patch(next.id, {
              state: "error",
              error: err instanceof ApiError ? (err.code ?? `http_${err.status}`) : "network",
            });
          }
        } finally {
          this.aborts.delete(next.id);
          this.files.delete(next.id);
        }
      }
    } finally {
      this.running.delete(target);
    }
  }
}
