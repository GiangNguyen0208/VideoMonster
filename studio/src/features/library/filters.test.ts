import { describe, expect, it } from "vitest";
import type { ProjectSummary } from "@/types/api";
import { filterProjects, groupBySeries, seriesNames, statusFilterOf } from "./filters";

const p = (over: Partial<ProjectSummary>): ProjectSummary => ({
  project_id: "id",
  title: "Title",
  series: null,
  pipeline_type: "cinematic",
  has_pipeline_state: true,
  poster: null,
  live: false,
  last_activity: 0,
  active_stage: null,
  awaiting_human: false,
  stage_states: [{ name: "script", status: "pending" }],
  completed_count: 0,
  render_count: 0,
  scene_count: 0,
  ...over,
});

const waiting = p({
  project_id: "w",
  title: "Black holes",
  stage_states: [{ name: "script", status: "awaiting_human" }],
});
const failed = p({
  project_id: "f",
  pipeline_type: "animation",
  stage_states: [{ name: "assets", status: "failed" }],
});
const done = p({
  project_id: "d",
  series: "S1",
  stage_states: [{ name: "x", status: "completed" }],
});

describe("library filters", () => {
  it("classifies status buckets", () => {
    expect([waiting, failed, done].map(statusFilterOf)).toEqual(["waiting", "attention", "done"]);
  });

  it("filters by series and lists the distinct names", () => {
    const all = [waiting, failed, done];
    expect(filterProjects(all, { q: "", status: "all", type: "", series: "S1" })).toEqual([done]);
    expect(seriesNames([...all, p({ project_id: "e", series: "A" })])).toEqual(["A", "S1"]);
  });

  it("filters by search, status and type", () => {
    const all = [waiting, failed, done];
    expect(filterProjects(all, { q: "black", status: "all", type: "" })).toEqual([waiting]);
    expect(filterProjects(all, { q: "", status: "attention", type: "" })).toEqual([failed]);
    expect(filterProjects(all, { q: "", status: "all", type: "animation" })).toEqual([failed]);
  });

  it("groups by series with ungrouped last", () => {
    const groups = groupBySeries([waiting, done, p({ project_id: "a", series: "A" })]);
    expect(groups.map(([k]) => k)).toEqual(["A", "S1", null]);
  });
});
