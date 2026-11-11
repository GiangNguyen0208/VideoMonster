import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeEventSource } from "@/test/fakes";
import { SSE_DEBOUNCE_MS, useSSE } from "./useSSE";

describe("useSSE", () => {
  let client: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    vi.useFakeTimers();
    client = new QueryClient();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("invalidates queries once per debounced burst of change events", () => {
    const spy = vi.spyOn(client, "invalidateQueries");
    const onChange = vi.fn();
    renderHook(() => useSSE("/api/library/events", [["projects"]], onChange), { wrapper });
    const source = FakeEventSource.instances[0]!;
    expect(source.url).toBe("/api/library/events");

    act(() => {
      source.emit({ type: "change", project_id: "a" });
      source.emit({ type: "change", project_id: "b" });
      vi.advanceTimersByTime(SSE_DEBOUNCE_MS);
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ queryKey: ["projects"] });
    expect(onChange).toHaveBeenCalledWith({ type: "change", project_id: "b" });
  });

  it("ignores hello, heartbeat and malformed messages", () => {
    const spy = vi.spyOn(client, "invalidateQueries");
    renderHook(() => useSSE("/api/project/film/events", [["project", "film"]]), { wrapper });
    const source = FakeEventSource.instances[0]!;
    act(() => {
      source.emit({ type: "hello" });
      source.emit({ type: "heartbeat", ts: 1 });
      source.onmessage?.(new MessageEvent("message", { data: "not json" }));
      vi.advanceTimersByTime(SSE_DEBOUNCE_MS * 2);
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("closes the stream on unmount and does nothing for a null url", () => {
    const { unmount } = renderHook(() => useSSE("/api/library/events", []), { wrapper });
    unmount();
    expect(FakeEventSource.instances[0]!.closed).toBe(true);

    renderHook(() => useSSE(null, []), { wrapper });
    expect(FakeEventSource.instances).toHaveLength(1);
  });
});
