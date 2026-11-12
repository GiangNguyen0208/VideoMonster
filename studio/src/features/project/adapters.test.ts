import { describe, expect, it } from "vitest";
import type { ProjectSummary, StageState } from "@/types/api";
import { activityLines, currentDecisions, deriveStatus, progress, summaryStatus } from "./adapters";

const stages = (...statuses: StageState["status"][]): StageState[] =>
  statuses.map((status, i) => ({ name: ["research", "script", "assets", "compose"][i]!, status }));

const base = { hasPipelineState: true, renderCount: 0, stalled: false };

describe("deriveStatus", () => {
  it("prioritises a waiting review point", () => {
    const s = deriveStatus({ ...base, stages: stages("completed", "awaiting_human", "failed") });
    expect(s).toMatchObject({ kind: "waiting", stage: "script", tone: "accent" });
    expect(s.label).toBe("Waiting for you: review the script");
  });

  it("reports failures before running steps", () => {
    expect(deriveStatus({ ...base, stages: stages("failed", "in_progress") }).kind).toBe("failed");
  });

  it("distinguishes stalled from working", () => {
    const st = stages("completed", "in_progress");
    expect(deriveStatus({ ...base, stages: st }).kind).toBe("working");
    expect(deriveStatus({ ...base, stages: st, stalled: true }).kind).toBe("stalled");
  });

  it("is paused between steps and done when finished or rendered", () => {
    expect(deriveStatus({ ...base, stages: stages("completed", "pending") })).toMatchObject({
      kind: "paused",
      stage: "script",
    });
    expect(deriveStatus({ ...base, stages: stages("completed", "completed") }).label).toBe(
      "Finished",
    );
    expect(
      deriveStatus({ ...base, stages: stages("completed", "pending"), renderCount: 1 }).label,
    ).toBe("Video ready");
  });

  it("handles projects without pipeline state", () => {
    expect(deriveStatus({ ...base, stages: [], hasPipelineState: false }).kind).toBe("empty");
    expect(
      deriveStatus({ ...base, stages: [], hasPipelineState: false, renderCount: 2 }).kind,
    ).toBe("done");
  });

  it("never leaks raw stage ids into labels", () => {
    const s = deriveStatus({ ...base, stages: [{ name: "scene_plan", status: "awaiting_human" }] });
    expect(s.label).toBe("Waiting for you: review the storyboard");
  });

  it("maps a summary", () => {
    const summary = {
      stage_states: stages("in_progress"),
      has_pipeline_state: true,
      render_count: 0,
      stalled: true,
    } as ProjectSummary;
    expect(summaryStatus(summary).kind).toBe("stalled");
  });
});

it("progress counts completed steps", () => {
  expect(progress(stages("completed", "completed", "pending", "pending"))).toBe(0.5);
  expect(progress([])).toBe(0);
});

describe("currentDecisions", () => {
  it("keeps the latest pick per category+subject and counts revisions", () => {
    const log = {
      decisions: [
        {
          category: "voice_selection",
          subject: "Narration voice",
          selected: "onyx",
          options_considered: [{ option_id: "onyx", label: "OpenAI Onyx" }],
        },
        { category: "concept_selection", subject: "Concept", selected: "c1" },
        {
          category: "voice_selection",
          subject: "Narration voice",
          selected: "piper",
          reason: "free",
          options_considered: [
            { option_id: "piper", label: "Piper (local)" },
            { option_id: "onyx", label: "OpenAI Onyx" },
          ],
        },
      ],
    };
    const views = currentDecisions(log);
    expect(views).toHaveLength(2);
    expect(views[0]).toMatchObject({
      category: "Voice Selection",
      picked: "Piper (local)",
      reason: "free",
      alternatives: ["OpenAI Onyx"],
      revisions: 1,
    });
    expect(views[1]).toMatchObject({ picked: "c1", revisions: 0 });
  });

  it("tolerates missing or malformed logs", () => {
    expect(currentDecisions(undefined)).toEqual([]);
    expect(currentDecisions({ decisions: "nope" })).toEqual([]);
    expect(currentDecisions({ decisions: [null, 3] })).toEqual([]);
  });
});

describe("activityLines", () => {
  it("renders events newest-first in plain words", () => {
    const lines = activityLines([
      { ts: "1", tool: "flux_image", event: "start", scene_id: "sc1" },
      {
        ts: "2",
        tool: "flux_image",
        event: "finish",
        scene_id: "sc1",
        success: true,
        cost_usd: 0.05,
      },
      { ts: "3", tool: "piper_tts", event: "finish", success: false, error: "no voice" },
    ]);
    expect(lines.map((l) => l.text)).toEqual([
      "Piper Tts failed: no voice",
      "Flux Image finished for scene sc1 · $0.05",
      "Flux Image started for scene sc1",
    ]);
    expect(lines[0]!.tone).toBe("danger");
  });
});
