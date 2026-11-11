import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { setLocale } from "@/i18n";
import type { BoardState, ProjectCost, ProjectSummary, Results, SettingsView } from "@/types/api";
import boardFixture from "@/test/fixtures/board-state.json";
import summaryFixture from "@/test/fixtures/project-summary.json";
import { mockFetch } from "@/test/fakes";
import { renderRoute } from "@/test/render";

const PID = "backlot-demo-run";
const SESSION = {
  token: "t",
  version: "0",
  user: { id: "local", display_name: "L" },
  features: {},
};

function board(): BoardState {
  const s = JSON.parse(JSON.stringify(boardFixture)) as BoardState;
  for (const stage of s.stages) stage.status = "completed";
  s.media.renders = [
    { path: "renders/final.mp4", size: 3_000_000, mtime: 200 },
    { path: "renders/final_vertical.mp4", size: 2_000_000, mtime: 100 },
  ];
  return s;
}

const RESULTS: Results = {
  renders: [
    {
      path: "renders/final.mp4",
      name: "final.mp4",
      size: 3_000_000,
      mtime: 200,
      label: null,
      resolution: "1920x1080",
      duration_s: 62,
      fps: 30,
      in_report: true,
    },
    {
      path: "renders/final_vertical.mp4",
      name: "final_vertical.mp4",
      size: 2_000_000,
      mtime: 100,
      label: "TikTok",
      resolution: "1080x1920",
      duration_s: 31,
      fps: 30,
      in_report: true,
    },
  ],
  publish: {
    source: "publish_log",
    platform: "tiktok",
    title: "The Last Lighthouse",
    description: "A keeper's last night.",
    hashtags: ["#story", "#lighthouse"],
  },
  export: {
    kind: "folder",
    name: `${PID}-export.zip`,
    files: 3,
    size: 5_000_000,
    platform: "youtube",
  },
};

const COST: ProjectCost = {
  has_log: true,
  budget_total_usd: 2,
  budget_mode: "warn",
  snapshot: { total_spent_usd: 1.5, total_reserved_usd: 0.75, budget_remaining_usd: -0.25 },
  by_tool: [
    { tool: "flux_image", spent_usd: 1.5, reserved_usd: 0, count: 4, free: false },
    { tool: "kling_video", spent_usd: 0, reserved_usd: 0, count: 1, free: false },
    { tool: "elevenlabs_tts", spent_usd: 0, reserved_usd: 0.75, count: 1, free: false },
    { tool: "piper_tts", spent_usd: 0, reserved_usd: 0, count: 2, free: true },
  ],
  by_stage: [
    { stage: "assets", spent_usd: 1.5, reserved_usd: 0, count: 4 },
    { stage: null, spent_usd: 0, reserved_usd: 0.75, count: 1 },
  ],
  by_status: {
    completed: { count: 5, usd: 1.4 },
    failed: { count: 1, usd: 0.1 },
    reserved: { count: 1, usd: 0.75 },
    refunded: { count: 1, usd: 0.5 },
  },
  entries: [],
};

const SETTINGS: SettingsView = {
  settings: {
    budget: {
      mode: "warn",
      total_usd: 10,
      single_action_approval_usd: 0.5,
      require_approval_for_new_paid_tool: true,
    },
    checkpoint: { policy: "guided" },
    output: { default_resolution: "1920x1080", default_fps: 30 },
  },
  choices: { resolutions: ["1920x1080", "1080x1920"], fps: [24, 30, 60] },
};

function serve(opts: { results?: Results; reject422?: boolean } = {}) {
  const put: unknown[] = [];
  const summary = {
    ...(summaryFixture as unknown as ProjectSummary),
    latest_render: "renders/final.mp4",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(
      mockFetch([
        ["/api/v1/session", SESSION],
        ["/api/projects", [summary]],
        [`/api/project/${PID}/state`, board()],
        [`/api/v1/projects/${PID}/results`, opts.results ?? RESULTS],
        [`/api/v1/projects/${PID}/cost`, COST],
        [/^\/api\/v1\/cost\/summary\?since=/, { since: "", spent_usd: 12.5, projects: 3 }],
        [
          "/api/v1/settings",
          (_url: string, init?: RequestInit) => {
            if (init?.method === "PUT") {
              const body = JSON.parse(String(init.body)) as SettingsView["settings"];
              put.push(body);
              if (opts.reject422) {
                return Response.json(
                  { detail: [{ loc: ["body", "output", "default_fps"], msg: "bad", type: "x" }] },
                  { status: 422 },
                );
              }
              return Response.json({ ...SETTINGS, settings: body });
            }
            return Response.json(SETTINGS);
          },
        ],
      ]),
    ),
  );
  return { put };
}

describe("Results", () => {
  it("lists every version with facts, downloads and copy-ready text", async () => {
    serve();
    const user = userEvent.setup();
    renderRoute(`/p/${PID}`);

    const section = await screen.findByRole("region", { name: "Your video" });
    const versions = await within(section).findByRole("list", { name: "Versions" });
    expect(await within(versions).findByText("TikTok")).toBeInTheDocument();
    expect(within(versions).getByText("1080×1920 · 0:31 · 30 fps · 1.9 MB")).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: "Download" })).toHaveAttribute(
      "href",
      `/media/${PID}/renders/final.mp4?download=1`,
    );
    await user.click(within(versions).getByRole("button", { name: "final_vertical.mp4" }));
    expect(section.querySelector("video")).toHaveAttribute(
      "src",
      `/media/${PID}/renders/final_vertical.mp4`,
    );

    await user.click(within(section).getByRole("button", { name: "Copy hashtags" }));
    // userEvent.setup() provides the clipboard.
    expect(await navigator.clipboard.readText()).toBe("#story #lighthouse");
    expect(within(section).getByRole("button", { name: "Copy hashtags" })).toHaveTextContent(
      "Copied",
    );
    expect(within(section).getByText("A keeper's last night.")).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: "Download bundle" })).toHaveAttribute(
      "href",
      `/api/v1/projects/${PID}/export`,
    );
    expect(within(section).getByText(/3 files · 4.8 MB · youtube/)).toBeInTheDocument();
  });

  it("explains how to get an export bundle when there is none", async () => {
    serve({
      results: {
        ...RESULTS,
        export: null,
        publish: { ...RESULTS.publish, source: "project", description: null, hashtags: [] },
      },
    });
    renderRoute(`/p/${PID}`);
    expect(await screen.findByText(/No export bundle yet/)).toBeInTheDocument();
    expect(screen.getByText(/hasn't written a post yet/)).toBeInTheDocument();
  });

  it("downloads the latest video straight from Home", async () => {
    serve();
    renderRoute("/");
    expect(
      await screen.findByRole("link", { name: "Download The Last Lighthouse" }),
    ).toHaveAttribute("href", `/media/${PID}/renders/final.mp4?download=1`);
  });
});

describe("Cost panel", () => {
  it("shows spent, reserved and remaining against the budget", async () => {
    serve();
    renderRoute(`/p/${PID}`);
    const panel = await screen.findByRole("region", { name: "Cost" });
    expect(panel).toHaveTextContent("$1.50 of $2.00 budget");
    expect(within(panel).getByRole("img")).toHaveAccessibleName(
      "Spent $1.50, reserved $0.75, remaining -$0.25",
    );
    expect(within(panel).getByRole("alert")).toHaveTextContent("over its budget");
    expect(panel).toHaveTextContent("Warn me: The agent stops and asks you");
    const tools = within(panel).getByRole("table", { name: "By tool" });
    expect(within(tools).getByText("Piper Tts").closest("tr")).toHaveTextContent("Free (local)");
    expect(within(tools).getByText("Kling Video").closest("tr")).toHaveTextContent("$0.00");
    expect(within(tools).getByText("+ $0.75 reserved")).toBeInTheDocument();
    const steps = within(panel).getByRole("table", { name: "By step" });
    expect(within(steps).getByText("Other")).toBeInTheDocument();
    expect(panel).toHaveTextContent("5 paid · 1 failed (still charged) · 1 reserved · 1 refunded");
  });

  it("shows the month's spend in the Library and works in Vietnamese", async () => {
    setLocale("vi");
    serve();
    renderRoute("/library");
    const stat = (await screen.findByText("Đã chi tháng này")).parentElement!;
    expect(stat).toHaveTextContent(/12,50\sUS\$/);
    expect(stat).toHaveTextContent("cho 3 video");
  });
});

describe("Settings", () => {
  it("saves spending limits and defaults", async () => {
    const { put } = serve();
    const user = userEvent.setup();
    renderRoute("/settings");
    await user.click(await screen.findByRole("button", { name: "Hard limit" }));
    const total = screen.getByLabelText("Budget per video (USD)");
    await user.clear(total);
    await user.type(total, "25");
    await user.click(screen.getByRole("button", { name: "After every step" }));
    await user.selectOptions(screen.getByLabelText("Video size"), "1080x1920");
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    await waitFor(() => expect(put).toHaveLength(1));
    expect(put[0]).toEqual({
      budget: {
        mode: "cap",
        total_usd: 25,
        single_action_approval_usd: 0.5,
        require_approval_for_new_paid_tool: true,
      },
      checkpoint: { policy: "manual_all" },
      output: { default_resolution: "1080x1920", default_fps: 30 },
    });
    expect(await screen.findByText(/Saved\. Your agent uses these/)).toBeInTheDocument();
  });

  it("validates amounts and shows field errors from the server, in Vietnamese", async () => {
    setLocale("vi");
    const { put } = serve({ reject422: true });
    const user = userEvent.setup();
    renderRoute("/settings");
    const total = await screen.findByLabelText("Ngân sách mỗi video (USD)");
    await user.clear(total);
    expect(screen.getByText("Nhập số tiền từ 0 đến 10.000")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lưu cài đặt" })).toBeDisabled();
    await user.type(total, "5");
    await user.selectOptions(screen.getByLabelText("Tốc độ khung hình"), "60");
    await user.click(screen.getByRole("button", { name: "Lưu cài đặt" }));
    await waitFor(() => expect(put).toHaveLength(1));
    const fps = screen.getByLabelText("Tốc độ khung hình");
    expect(fps).toHaveAccessibleDescription("Giá trị này không hợp lệ");
  });
});
