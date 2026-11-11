import { describe, expect, it } from "vitest";
import { GOALS, goalById } from "@/content/goals";
import { CATALOGS } from "@/i18n";
import type { PipelineInfo, StyleInfo } from "@/lib/api";
import {
  deriveTitle,
  EMPTY_VALUES,
  presetFor,
  splitList,
  stylesFor,
  toIntake,
  wizardSchema,
} from "./wizard";

describe("goal config", () => {
  it("has one goal per video type and unique ids", () => {
    const types = GOALS.map((g) => g.pipeline_type);
    expect(new Set(types).size).toBe(types.length);
    expect(new Set(GOALS.map((g) => g.id)).size).toBe(GOALS.length);
    for (const catalog of Object.values(CATALOGS)) {
      expect(new Set(types)).toEqual(new Set(Object.keys(catalog.labels.videoTypes)));
      expect(new Set(GOALS.map((g) => g.id))).toEqual(new Set(Object.keys(catalog.goals)));
      for (const g of GOALS) expect(catalog.goals[g.id]!.examples.length).toBeGreaterThan(0);
    }
  });
});

describe("wizard helpers", () => {
  it("splits list fields on commas and newlines", () => {
    expect(splitList(" a, b\n\nc ,")).toEqual(["a", "b", "c"]);
  });

  it("derives a short, capitalised title", () => {
    expect(deriveTitle("  how   black holes form ")).toBe("How black holes form");
    const long = deriveTitle("word ".repeat(40));
    expect(long.length).toBeLessThanOrEqual(81);
    expect(long.endsWith("…")).toBe(true);
  });

  it("maps form values to a studio.intake/1 payload", () => {
    const values = {
      ...EMPTY_VALUES,
      ...presetFor(goalById("app-demo")!),
      topic: " Install the CLI ",
      must_include: "brew install, first run",
      platform: "linkedin" as const,
    };
    const intake = toIntake(values);
    expect(intake).toMatchObject({
      title: "Install the CLI",
      pipeline_type: "screen-demo",
      brief: {
        topic: "Install the CLI",
        aspect: "1:1",
        must_include: ["brew install", "first run"],
        tone: "Clear, Professional",
      },
      style_playbook: null,
      reference: { url: null, notes: null },
      advanced: { render_runtime_preference: null, production_mode: null },
    });
  });

  it("only validates the reference link for the 'like this' goal", () => {
    const base = { ...EMPTY_VALUES, goal: "app-demo", pipeline_type: "screen-demo", topic: "abc" };
    expect(wizardSchema.safeParse(base).success).toBe(true);
    const likeThis = { ...base, goal: "like-this", reference_url: "ftp://x" };
    expect(wizardSchema.safeParse(likeThis).success).toBe(false);
    expect(wizardSchema.safeParse({ ...likeThis, reference_url: "https://x.y/z" }).success).toBe(
      true,
    );
  });

  it("filters styles by what the video type works with", () => {
    const style = (name: string, custom = false) =>
      ({ name, title: name, mood: null, best_for: null, palette: [], custom }) as StyleInfo;
    const styles = [style("a"), style("b"), style("c"), style("mine", true)];
    const info = {
      compatible_playbooks: { recommended: ["b"], also_works: ["a"], custom_allowed: true },
    } as PipelineInfo;
    expect(stylesFor(info, styles).map((s) => s.name)).toEqual(["b", "a", "mine"]);
    const none = {
      compatible_playbooks: { recommended: [], also_works: [], custom_allowed: false },
    };
    expect(stylesFor(none as unknown as PipelineInfo, styles)).toHaveLength(4);
  });
});
