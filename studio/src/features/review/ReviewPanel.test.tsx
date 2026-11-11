import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { setLocale } from "@/i18n";
import type { BoardState, DecisionInput, StudioDecision } from "@/types/api";
import boardFixture from "@/test/fixtures/board-state.json";
import { mockFetch } from "@/test/fakes";
import { renderRoute } from "@/test/render";
import {
  proposalDefaults,
  reviewCounts,
  runtimeOptions,
  runtimeRationale,
  stageUnderReview,
} from "./review";

const PID = "backlot-demo-run";
const TS = "2026-11-10T09:00:00+00:00";
const SESSION = {
  token: "t",
  version: "0",
  user: { id: "local", display_name: "L" },
  features: {},
};

/** The demo run, frozen at one review point. */
function boardAt(stageName: string, review: unknown = null): BoardState {
  const s = JSON.parse(JSON.stringify(boardFixture)) as BoardState;
  let reached = false;
  for (const stage of s.stages) {
    if (stage.name === stageName) {
      stage.status = "awaiting_human";
      stage.timestamp = TS;
      stage.review = review as BoardState["stages"][number]["review"];
      reached = true;
    } else if (reached) {
      stage.status = "pending";
    }
  }
  s.media.renders = [];
  s.artifacts.decision_log = {
    decisions: [
      {
        category: "render_runtime_selection",
        subject: "Runtime",
        selected: "remotion",
        options_considered: [
          { option_id: "remotion", label: "Remotion", reason: "Best for data scenes" },
          { option_id: "hyperframes", label: "HyperFrames", reason: "Best for kinetic type" },
        ],
      },
    ],
  };
  return s;
}

const decision = (state: StudioDecision["state"], over: Partial<StudioDecision> = {}) =>
  ({
    schema: "studio.decision/1",
    id: "20261110T090100Z-proposal-abc123",
    created_at: "2026-11-10T09:01:00+00:00",
    stage: "proposal",
    checkpoint_timestamp: TS,
    action: "approve",
    notes: "",
    proposal: null,
    source: "studio",
    state,
    ...over,
  }) as StudioDecision;

interface ServerOpts {
  board: BoardState;
  decisions?: StudioDecision[];
  runtimes?: Record<string, boolean>;
  reject?: { status: number; code: string };
}

function serve({ board, decisions = [], runtimes, reject }: ServerOpts) {
  const posted: DecisionInput[] = [];
  const deleted: string[] = [];
  let current = decisions;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      mockFetch([
        ["/api/v1/session", SESSION],
        [`/api/project/${PID}/state`, board],
        [`/api/v1/projects/${PID}/kickoff`, () => Response.json({}, { status: 404 })],
        [`/api/v1/projects/${PID}/inputs`, { files: [], references: [], started: true }],
        [
          "/api/v1/music",
          { tracks: [{ name: "calm_piano.mp3", title: "calm piano", size: 2048, duration_s: 95 }] },
        ],
        ["/api/v1/uploads/limits", { max_bytes: 1024, extensions: { audio: [".mp3"] } }],
        [
          "/api/v1/setup",
          {
            tier: "zero_key",
            runtimes: runtimes ?? { ffmpeg: true, remotion: true, hyperframes: true },
            video_types: [],
            keys: {},
            rechecking: null,
          },
        ],
        [
          new RegExp(`^/api/v1/projects/${PID}/decisions/(.+)$`),
          (url: string) => {
            deleted.push(url.split("/").pop()!);
            current = [];
            return new Response(null, { status: 204 });
          },
        ],
        [
          `/api/v1/projects/${PID}/decisions`,
          (_url: string, init?: RequestInit) => {
            if (init?.method === "POST") {
              const body = JSON.parse(String(init.body)) as DecisionInput;
              posted.push(body);
              if (reject) {
                return Response.json(
                  { detail: "server says no", code: reject.code },
                  { status: reject.status },
                );
              }
              const made = decision("pending", { ...body, proposal: body.proposal ?? null });
              current = [made];
              return Response.json(made, { status: 201 });
            }
            return Response.json({ decisions: current });
          },
        ],
      ]),
    ),
  );
  return { posted, deleted };
}

describe("Review panel", () => {
  it("approves the proposal with picks, shows both engines, then the pending state", async () => {
    const { posted, deleted } = serve({
      board: boardAt("proposal"),
      runtimes: { ffmpeg: true, remotion: true, hyperframes: false },
    });
    const user = userEvent.setup();
    renderRoute(`/p/${PID}`);

    const panel = await screen.findByRole("region", { name: "Review: Concept & plan" });
    const remotion = within(panel).getByRole("button", { name: /Remotion/ });
    const hyper = within(panel).getByRole("button", { name: /HyperFrames/ });
    expect(remotion).toHaveTextContent("Agent's pick");
    expect(remotion).toHaveTextContent("Best for data scenes");
    await waitFor(() => expect(hyper).toBeDisabled());
    expect(hyper).toHaveTextContent("Not available on this machine");
    expect(within(panel).getByText("Only Remotion is available on this machine.")).toBeVisible();

    await user.click(within(panel).getByRole("button", { name: /X From Scratch/ }));
    const budget = within(panel).getByLabelText("Budget you approve (USD)");
    expect(budget).toHaveValue(0.52);
    await user.clear(budget);
    await user.type(budget, "1.5");
    await user.click(within(panel).getByRole("button", { name: "No music" }));
    await user.click(within(panel).getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({
      stage: "proposal",
      checkpoint_timestamp: TS,
      action: "approve",
      proposal: {
        selected_concept_id: "c2",
        approved_budget_usd: 1.5,
        render_runtime: "remotion",
        music_source: "none",
      },
    });

    expect(await screen.findByText("Approval sent")).toBeInTheDocument();
    expect(screen.getByText(`claude "/studio-continue ${PID}"`)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retract" }));
    await waitFor(() => expect(deleted).toEqual(["20261110T090100Z-proposal-abc123"]));
    expect(await screen.findByRole("region", { name: /Review:/ })).toBeInTheDocument();
  });

  it("requests script changes with section comments and needs notes", async () => {
    const { posted } = serve({
      board: boardAt("script", { summary: "Hook is strong.", critical: 0, suggestions: 1 }),
    });
    const user = userEvent.setup();
    renderRoute(`/p/${PID}`);
    const panel = await screen.findByRole("region", { name: "Review: Script" });
    expect(panel).toHaveTextContent("Hook is strong.");
    expect(panel).toHaveTextContent("0 critical · 1 suggestions · 0 nitpicks");

    await user.click(within(panel).getByRole("button", { name: "Request changes" }));
    const send = within(panel).getByRole("button", { name: "Send changes" });
    expect(send).toBeDisabled();

    await user.click(within(panel).getByText("Comment on sections"));
    await user.type(within(panel).getByLabelText("Comment on Opening"), "Start with the storm");
    await user.type(within(panel).getByLabelText("What should change?"), "Shorter overall");
    await user.click(send);
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]!.action).toBe("revise");
    expect(posted[0]!.notes).toBe("Shorter overall\n[Opening] Start with the storm");
    expect(posted[0]!.proposal).toBeNull();
    expect(await screen.findByText("Change request sent")).toBeInTheDocument();
  });

  it("asks before stopping the project", async () => {
    const { posted } = serve({ board: boardAt("scene_plan") });
    const user = userEvent.setup();
    renderRoute(`/p/${PID}`);
    const panel = await screen.findByRole("region", { name: "Review: Storyboard" });
    expect(panel).toHaveTextContent("The storyboard is shown in the tab below.");
    await user.click(within(panel).getByRole("button", { name: "Stop project" }));
    const dialog = await screen.findByRole("dialog", { name: "Stop this project?" });
    expect(posted).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "Stop project" }));
    await waitFor(() => expect(posted[0]?.action).toBe("abort"));
  });

  it("translates a stale-checkpoint rejection", async () => {
    serve({ board: boardAt("script"), reject: { status: 409, code: "stale_checkpoint" } });
    const user = userEvent.setup();
    renderRoute(`/p/${PID}`);
    const panel = await screen.findByRole("region", { name: "Review: Script" });
    await user.click(within(panel).getByRole("button", { name: "Approve" }));
    expect(await within(panel).findByRole("alert")).toHaveTextContent(
      "This step changed — review the new version.",
    );
  });

  it("shows 'applying' once the agent consumed the decision", async () => {
    serve({ board: boardAt("proposal"), decisions: [decision("consumed")] });
    renderRoute(`/p/${PID}`);
    expect(
      await screen.findByText("The agent is applying your decision…", { selector: "p" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /Review:/ })).toBeNull();
  });

  it("says when the step was revised after the last answer", async () => {
    serve({
      board: boardAt("script"),
      decisions: [
        decision("consumed", { stage: "script", checkpoint_timestamp: "2026-11-10T08:00:00Z" }),
      ],
    });
    renderRoute(`/p/${PID}`);
    expect(
      await screen.findByText("This step changed since your last answer — review the new version."),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Review: Script" })).toBeInTheDocument();
  });

  it("shows what the agent learned from the reference and picks a library track", async () => {
    const board = boardAt("proposal");
    board.artifacts.video_analysis_brief = {
      source: { url: "https://youtu.be/abc", title: "Rain explainer" },
      content_analysis: { summary: "A fast weather explainer.", tone: "educational" },
      structure_analysis: { total_scenes: 8, pacing_profile: { avg_scene_duration_seconds: 4.25 } },
      style_profile: { closest_playbook: "flat-motion-graphics" },
      replication_guidance: {
        key_elements_to_replicate: ["Big kinetic captions"],
        creative_differentiation_seeds: ["Use a storm-chaser narrator"],
      },
    };
    const { posted } = serve({ board });
    const user = userEvent.setup();
    renderRoute(`/p/${PID}`);
    const panel = await screen.findByRole("region", { name: "Review: Concept & plan" });
    const insights = within(panel).getByRole("region", {
      name: "What the agent learned from your reference",
    });
    expect(insights).toHaveTextContent("A fast weather explainer.");
    expect(insights).toHaveTextContent("8 scenes · about 4.3 s per scene · Tone: educational");
    expect(insights).toHaveTextContent("Closest style: Flat Motion Graphics");
    expect(insights).toHaveTextContent("Big kinetic captions");
    expect(insights).toHaveTextContent("Use a storm-chaser narrator");

    await user.click(within(panel).getByRole("button", { name: "Music library" }));
    await user.click(await within(panel).findByRole("button", { name: /^calm piano/ }));
    await user.click(within(panel).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]!.proposal).toMatchObject({
      music_source: "user_library",
      music_track: "calm_piano.mp3",
    });
  });

  it("works in Vietnamese", async () => {
    setLocale("vi");
    const { posted } = serve({ board: boardAt("proposal") });
    const user = userEvent.setup();
    renderRoute(`/p/${PID}`);
    const panel = await screen.findByRole("region", { name: "Duyệt: Ý tưởng & kế hoạch" });
    expect(
      within(panel).getByText("Cả hai công cụ đều được hiển thị — chọn cái bạn thích."),
    ).toBeVisible();
    await user.click(within(panel).getByRole("button", { name: "Yêu cầu sửa" }));
    await user.type(within(panel).getByLabelText("Cần sửa gì?"), "Ngắn hơn");
    await user.click(within(panel).getByRole("button", { name: "Gửi yêu cầu sửa" }));
    await waitFor(() => expect(posted[0]?.notes).toBe("Ngắn hơn"));
    expect(await screen.findByText("Đã gửi yêu cầu sửa")).toBeInTheDocument();
  });
});

describe("review helpers", () => {
  it("finds the step under review", () => {
    expect(stageUnderReview(boardAt("script"))?.name).toBe("script");
    expect(stageUnderReview(JSON.parse(JSON.stringify(boardFixture)) as BoardState)).toBeNull();
  });

  it("reads both review formats", () => {
    expect(reviewCounts({ critical: 1, suggestions: 2, summary: "ok" })).toEqual({
      summary: "ok",
      critical: 1,
      suggestions: 2,
      nitpicks: 0,
    });
    expect(
      reviewCounts({
        findings: [{ severity: "critical" }, { severity: "nitpick" }, { severity: "nitpick" }],
      }),
    ).toMatchObject({ critical: 1, suggestions: 0, nitpicks: 2 });
    expect(reviewCounts(null)).toBeNull();
  });

  it("derives proposal defaults and runtime options", () => {
    const d = proposalDefaults(boardFixture.artifacts.proposal_packet)!;
    expect(d.concept).toBe("c1");
    expect(d.concepts.map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
    expect(d.runtime).toBe("remotion");
    expect(d.budget).toBe(0.52);
    expect(runtimeOptions("remotion")).toEqual(["remotion", "hyperframes"]);
    expect(runtimeOptions("ffmpeg")).toEqual(["remotion", "hyperframes", "ffmpeg"]);
    expect(runtimeRationale(boardAt("proposal").artifacts.decision_log)).toEqual({
      remotion: "Best for data scenes",
      hyperframes: "Best for kinetic type",
    });
  });
});
