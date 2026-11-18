/**
 * Replay: rebuild what a project looked like at an earlier moment from the
 * checkpoint status trail (`stages[].history_entries`) and `events.jsonl`
 * timestamps. Pure; nothing here touches the server.
 */
import type { BoardState } from "@/types/api";

export interface ReplayBounds {
  t0: number;
  t1: number;
}

/** Epoch ms from an ISO string; a missing zone is read as UTC (checkpoints omit it). */
export function parseTs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  let s = String(iso);
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(s)) s += "Z";
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

/** First and last recorded moment, or null with fewer than two (nothing to scrub). */
export function replayBounds(state: BoardState): ReplayBounds | null {
  const moments: number[] = [];
  for (const st of state.stages) {
    for (const h of st.history_entries ?? []) {
      const t = parseTs(h.timestamp);
      if (t !== null) moments.push(t);
    }
  }
  for (const ev of state.events) {
    const t = parseTs(ev.ts);
    if (t !== null) moments.push(t);
  }
  if (moments.length < 2) return null;
  return { t0: Math.min(...moments), t1: Math.max(...moments) };
}

const REACHED = ["completed", "awaiting_human"];

/** The project as it was at `at` (epoch ms). */
export function stateAt(state: BoardState, at: number): BoardState {
  const view = JSON.parse(JSON.stringify(state)) as BoardState;
  for (const st of view.stages) {
    const past = (st.history_entries ?? []).filter((h) => {
      const t = parseTs(h.timestamp);
      return t !== null && t <= at;
    });
    const cur = past.at(-1);
    if (!cur) {
      st.status = "pending";
      st.review = null;
      st.timestamp = null;
      st.gate_skipped = false;
      st.partial_progress = null;
    } else {
      st.status = (cur.status as typeof st.status) || "pending";
      st.timestamp = cur.timestamp;
    }
  }
  view.events = view.events.filter((ev) => {
    const t = parseTs(ev.ts);
    return t !== null && t <= at;
  });

  const status = (name: string) => view.stages.find((s) => s.name === name)?.status;

  // Visuals appear as their scene finishes, or once assets completed (legacy
  // runs have no events).
  if (view.storyboard) {
    if (!REACHED.includes(status("scene_plan") ?? "")) {
      view.storyboard = null;
    } else {
      const assetsDone = status("assets") === "completed";
      const finished = new Set<string>();
      const running = new Map<string, string | null>();
      for (const ev of view.events) {
        if (!ev.scene_id) continue;
        if (ev.event === "finish") {
          finished.add(ev.scene_id);
          running.delete(ev.scene_id);
        } else if (ev.event === "start") running.set(ev.scene_id, ev.tool ?? null);
        else if (ev.event === "error") running.delete(ev.scene_id);
      }
      for (const scene of view.storyboard.scenes) {
        if (!(assetsDone || finished.has(scene.id))) {
          scene.visual = null;
          scene.takes = [];
          scene.audio = [];
        }
        scene.generating = running.has(scene.id);
        scene.generating_tool = running.get(scene.id) ?? null;
      }
    }
  }
  // Final artifacts stay hidden until their step happened.
  if (!REACHED.includes(status("script") ?? "")) delete view.artifacts.script;
  if (status("compose") !== "completed") view.media.renders = [];
  return view;
}
