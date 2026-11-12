import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

/** Debounce window for change bursts — same as backlot/ui/lib.js `subscribe`. */
export const SSE_DEBOUNCE_MS = 250;

interface SSEMessage {
  type: "hello" | "change" | "heartbeat";
  project_id?: string;
}

/**
 * Subscribe to a Backlot SSE stream (`/api/project/:id/events` or
 * `/api/library/events`) and invalidate the given queries on `change`.
 * EventSource reconnects on its own; heartbeats and hellos are ignored.
 */
export function useSSE(
  url: string | null,
  invalidate: QueryKey[],
  onChange?: (msg: SSEMessage) => void,
): void {
  const queryClient = useQueryClient();
  const latest = useRef({ invalidate, onChange });

  useEffect(() => {
    latest.current = { invalidate, onChange };
  });

  useEffect(() => {
    if (!url) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const source = new EventSource(url);
    source.onmessage = (event: MessageEvent<string>) => {
      let msg: SSEMessage;
      try {
        msg = JSON.parse(event.data) as SSEMessage;
      } catch {
        return;
      }
      if (msg.type !== "change") return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        for (const queryKey of latest.current.invalidate) {
          void queryClient.invalidateQueries({ queryKey });
        }
        latest.current.onChange?.(msg);
      }, SSE_DEBOUNCE_MS);
    };
    return () => {
      clearTimeout(timer);
      source.close();
    };
  }, [url, queryClient]);
}
