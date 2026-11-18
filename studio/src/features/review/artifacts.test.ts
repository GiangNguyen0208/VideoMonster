import { afterEach, describe, expect, it } from "vitest";
import { resetLocale, setLocale } from "@/i18n";
import type { Stage } from "@/types/api";
import { artifactNamesForStage, stageArtifactSummaries, summarizeArtifact } from "./artifacts";

const stage = (over: Partial<Stage>): Stage => ({
  name: "scene_plan",
  gated: true,
  produces: [],
  status: "awaiting_human",
  ...over,
});

afterEach(() => resetLocale());

describe("artifactNamesForStage", () => {
  it("merges declared and canonical names, skipping ones with their own view", () => {
    const names = artifactNamesForStage(
      stage({ name: "compose", produces: ["script", "render_report"] }),
    );
    expect(names).toEqual(["render_report", "final_review"]);
  });
});

describe("summarizeArtifact", () => {
  it("summarises a scene plan", () => {
    const s = summarizeArtifact("scene_plan", {
      scenes: [
        { id: "sc1", title: "Hook", end_seconds: 5 },
        { id: "sc2", title: "Body", end_seconds: 65 },
      ],
    });
    expect(s?.facts).toEqual([
      { label: "Scenes", value: "2" },
      { label: "Duration", value: "1:05" },
    ]);
    expect(s?.items.map((i) => i.title)).toEqual(["Hook", "Body"]);
  });

  it("falls back to scalars and the first list for unknown artifacts", () => {
    const s = summarizeArtifact("final_review", {
      verdict: "pass",
      issues: [{ description: "Audio clips at 0:12" }],
    });
    expect(s?.facts).toEqual([
      { label: "Verdict", value: "pass" },
      { label: "Issues", value: "1 item" },
    ]);
    expect(s?.items[0]?.title).toBe("Audio clips at 0:12");
  });

  it("returns null for a non-object artifact", () => {
    expect(summarizeArtifact("brief", "nope")).toBeNull();
  });

  it("uses the active language for labels", () => {
    setLocale("vi");
    const s = summarizeArtifact("edit_decisions", { cuts: [{ id: "c1" }] });
    expect(s?.facts[0]).toEqual({ label: "Đoạn cắt", value: "1" });
  });
});

describe("stageArtifactSummaries", () => {
  it("skips artifacts that are missing or empty", () => {
    const out = stageArtifactSummaries(stage({ name: "assets" }), { asset_manifest: {} });
    expect(out).toEqual([]);
  });
});
