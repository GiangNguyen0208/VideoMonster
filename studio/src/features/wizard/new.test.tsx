import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardState, IntakeInput, PipelineInfo, StyleInfo } from "@/types/api";
import boardFixture from "@/test/fixtures/board-state.json";
import { mockFetch } from "@/test/fakes";
import { renderRoute } from "@/test/render";

const SESSION = {
  token: "t",
  version: "0",
  user: { id: "local", display_name: "L" },
  features: {},
};

function pipeline(name: string, over: Partial<PipelineInfo> = {}): PipelineInfo {
  return {
    name,
    description: "",
    category: null,
    stability: "production",
    stages: [{ name: "proposal", gated: true }],
    reference_input: false,
    compatible_playbooks: {
      recommended: ["clean-professional"],
      also_works: [],
      custom_allowed: false,
    },
    production_modes: [],
    budget_default_usd: 2,
    default_checkpoint_policy: "guided",
    availability: { state: "ready", missing_required: [], missing_enhancements: [] },
    ...over,
  };
}

const PIPELINES = [
  pipeline("animated-explainer", {
    reference_input: true,
    availability: {
      state: "locked",
      missing_required: ["image_generation"],
      missing_enhancements: [],
    },
  }),
  pipeline("screen-demo", {
    production_modes: [
      { name: "real_capture", description: "OS screen recording" },
      { name: "synthetic_terminal", description: "Remotion TerminalScene" },
    ],
  }),
  pipeline("cinematic", {
    reference_input: true,
    stability: "beta",
    availability: {
      state: "limited",
      missing_required: [],
      missing_enhancements: ["video_generation"],
    },
  }),
];

const STYLES: StyleInfo[] = [
  {
    name: "clean-professional",
    title: "Clean Professional",
    mood: "polished",
    best_for: "Corporate explainers",
    palette: ["#FFFFFF", "#2563EB"],
    custom: false,
  },
];

const PID = "install-our-cli-ab12";
const KICKOFF = {
  project_id: PID,
  request: `Continue Studio project ${PID}`,
  agents: [
    {
      id: "claude",
      label: "Claude Code",
      command: `claude "/reel Continue Studio project ${PID}"`,
      note: "Run from the OpenMontage folder.",
    },
    { id: "codex", label: "Codex", command: `codex "Continue Studio project ${PID}"`, note: "" },
  ],
};

/** A board for a project the agent hasn't touched yet. */
function emptyBoard(): BoardState {
  const s = JSON.parse(JSON.stringify(boardFixture)) as BoardState;
  s.project_id = PID;
  s.title = "Install our CLI and run the first command";
  s.has_pipeline_state = false;
  for (const stage of s.stages) stage.status = "pending";
  s.media.renders = [];
  s.events = [];
  return s;
}

let created: IntakeInput[] = [];

function serve(tier: "zero_key" | "starter" = "zero_key") {
  created = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      mockFetch([
        ["/api/v1/session", SESSION],
        [
          "/api/v1/pipelines",
          {
            pipelines: PIPELINES,
            checked: true,
            defaults: { mode: "warn", total_usd: 10, checkpoint_policy: "guided" },
          },
        ],
        ["/api/v1/styles", { styles: STYLES }],
        ["/api/v1/setup", { tier, video_types: [], keys: {}, rechecking: null }],
        [
          "/api/v1/projects",
          (_url: string, init?: RequestInit) => {
            created.push(JSON.parse(String(init?.body)) as IntakeInput);
            return Response.json({ project_id: PID, kickoff: KICKOFF }, { status: 201 });
          },
        ],
        [`/api/project/${PID}/state`, emptyBoard()],
        [`/api/v1/projects/${PID}/kickoff`, { ...KICKOFF, started: false }],
      ]),
    ),
  );
}

describe("New video wizard", () => {
  beforeEach(() => serve());

  it("creates a project from goal → brief → look → review and shows the kickoff", async () => {
    const user = userEvent.setup();
    renderRoute("/new");

    await user.click(await screen.findByRole("button", { name: /App or terminal demo/ }));
    expect(await screen.findByRole("heading", { name: "Add your footage" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Animated terminal/ }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("heading", { name: "Tell us about it" })).toBeInTheDocument();
    // The footage step already chose how it is shown.
    expect(screen.queryByRole("group", { name: "How should it be shown?" })).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Install our CLI and run the first command" }),
    );
    await user.click(screen.getByRole("button", { name: /Shorts \/ Reels/ }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByRole("heading", { name: "Look & budget" })).toBeInTheDocument();
    expect(screen.getByText("Free — runs locally")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Clean Professional/ }));
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByRole("heading", { name: "Review & create" })).toBeInTheDocument();
    expect(screen.getByText(/Shorts \/ Reels \/ TikTok · 9:16 · 60 s/)).toBeInTheDocument();
    expect(screen.getByText("Animated terminal — no recording")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create video" }));

    await waitFor(() => expect(created).toHaveLength(1));
    const body = created[0]!;
    expect(body.pipeline_type).toBe("screen-demo");
    expect(body.goal).toBe("app-demo");
    expect(body.brief).toMatchObject({
      topic: "Install our CLI and run the first command",
      platform: "shorts",
      aspect: "9:16",
      duration_seconds: 60,
    });
    expect(body.style_playbook).toBe("clean-professional");
    expect(body.budget).toEqual({ cap_usd: 0, mode: "cap" });
    expect(body.advanced.production_mode).toBe("synthetic_terminal");
    expect(body.reference.url).toBeNull();

    expect(await screen.findByText("Waiting for the agent to start…")).toBeInTheDocument();
    expect(screen.getByText(`claude "/reel Continue Studio project ${PID}"`)).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Codex" }));
    expect(screen.getByText(`codex "Continue Studio project ${PID}"`)).toBeInTheDocument();
  });

  it("locked goals link to Setup instead of being selectable", async () => {
    renderRoute("/new");
    const card = (await screen.findByText("Explain a topic")).closest("div")!;
    expect(within(card).getByRole("link", { name: "Unlock in Setup" })).toHaveAttribute(
      "href",
      "/setup",
    );
    expect(within(card).getByText(/needs AI images/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Explain a topic/ })).toBeNull();
    // Limited types are still selectable and say what would improve them.
    const trailer = screen.getByRole("button", { name: /Trailer or teaser/ });
    expect(trailer).toHaveTextContent(/better with AI video clips/);
    expect(trailer).toHaveTextContent("beta");
  });

  it("requires a topic before moving on", async () => {
    const user = userEvent.setup();
    renderRoute("/new");
    await user.click(await screen.findByRole("button", { name: /Trailer or teaser/ }));
    await user.click(await screen.findByRole("button", { name: "Next" }));
    expect(await screen.findByText("Tell us what the video is about")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tell us about it" })).toBeInTheDocument();
  });

  it("'make something like this' needs a link and only offers unlocked reference types", async () => {
    const user = userEvent.setup();
    renderRoute("/new");
    await user.click(await screen.findByRole("button", { name: /Make something like this/ }));
    const select = await screen.findByLabelText("What kind of video should yours be?");
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Trailer or teaser"]);

    await user.type(screen.getByLabelText("What is your version about?"), "Our product launch");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText(/Paste a link that starts with http/)).toBeInTheDocument();

    await user.type(screen.getByLabelText("Link to the video you like"), "https://youtu.be/x");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("heading", { name: "Look & budget" })).toBeInTheDocument();
  });

  it("asks for a budget when paid tools are set up", async () => {
    serve("starter");
    const user = userEvent.setup();
    renderRoute("/new");
    await user.click(await screen.findByRole("button", { name: /Trailer or teaser/ }));
    await user.type(await screen.findByLabelText("What is the video about?"), "A sci-fi trailer");
    await user.click(screen.getByRole("button", { name: "Next" }));
    const budget = await screen.findByLabelText("Budget limit (USD)");
    expect(budget).toHaveValue(2);
    await user.clear(budget);
    await user.type(budget, "5");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Up to $5.00")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create video" }));
    await waitFor(() => expect(created[0]?.budget).toEqual({ cap_usd: 5, mode: "cap" }));
  });
});
