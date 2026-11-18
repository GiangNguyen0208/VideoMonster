import { describe, expect, it } from "vitest";
import type { BoardState } from "@/types/api";
import boardFixture from "@/test/fixtures/board-state.json";
import { parseTs, replayBounds, stateAt } from "./replay";

const board = boardFixture as unknown as BoardState;

describe("parseTs", () => {
  it("reads a zone-less timestamp as UTC", () => {
    expect(parseTs("2026-11-10T09:00:00")).toBe(Date.parse("2026-11-10T09:00:00Z"));
    expect(parseTs(null)).toBeNull();
    expect(parseTs("nope")).toBeNull();
  });
});

describe("replayBounds", () => {
  it("spans the history and the events", () => {
    const b = replayBounds(board)!;
    expect(b.t1).toBeGreaterThan(b.t0);
  });

  it("is null when there is nothing to scrub", () => {
    expect(replayBounds({ ...board, stages: [], events: [] })).toBeNull();
  });
});

describe("stateAt", () => {
  const { t0, t1 } = replayBounds(board)!;

  it("shows every step as not started before the run begins", () => {
    const early = stateAt(board, t0 - 1);
    expect(early.stages.every((s) => s.status === "pending")).toBe(true);
    expect(early.events).toEqual([]);
    expect(early.storyboard).toBeNull();
    expect(early.media.renders).toEqual([]);
    expect(early.artifacts.script).toBeUndefined();
  });

  it("matches the recorded status at the end and does not mutate the input", () => {
    const before = JSON.stringify(board);
    const end = stateAt(board, t1);
    expect(end.stages.map((s) => s.status)).toEqual(board.stages.map((s) => s.status));
    expect(JSON.stringify(board)).toBe(before);
  });

  it("never reports a later step ahead of an earlier moment", () => {
    const mid = stateAt(board, (t0 + t1) / 2);
    const done = mid.stages.filter((s) => s.status === "completed").length;
    const all = board.stages.filter((s) => s.status === "completed").length;
    expect(done).toBeLessThanOrEqual(all);
  });
});
