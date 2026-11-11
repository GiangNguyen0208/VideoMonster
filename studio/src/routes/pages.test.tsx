import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { BoardState, ProjectSummary } from "@/lib/api";
import { SSE_DEBOUNCE_MS } from "@/lib/api";
import boardFixture from "@/test/fixtures/board-state.json";
import summaryFixture from "@/test/fixtures/project-summary.json";
import { FakeEventSource, mockFetch } from "@/test/fakes";
import { renderRoute } from "@/test/render";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const board = () => clone(boardFixture) as unknown as BoardState;
const summary = (over: Partial<ProjectSummary> = {}) =>
  ({ ...clone(summaryFixture), ...over }) as ProjectSummary;

/** The demo run, frozen at the script review point. */
function waitingAtScript(): BoardState {
  const s = board();
  for (const stage of s.stages) {
    if (stage.name === "script") stage.status = "awaiting_human";
    else if (!["research", "proposal"].includes(stage.name)) stage.status = "pending";
  }
  return s;
}

const serve = (projects: ProjectSummary[], state: BoardState = board()) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(
      mockFetch([
        ["/api/projects", projects],
        [/^\/api\/project\/backlot-demo-run\/state$/, () => Response.json(state)],
      ]),
    ),
  );

describe("Home", () => {
  it("groups projects into waiting, attention, in progress and results", async () => {
    serve([
      summary({
        project_id: "a",
        title: "Waiting one",
        stage_states: [{ name: "script", status: "awaiting_human" }],
      }),
      summary({
        project_id: "b",
        title: "Broken one",
        stage_states: [{ name: "assets", status: "failed" }],
      }),
      summary({
        project_id: "c",
        title: "Busy one",
        stage_states: [{ name: "assets", status: "in_progress" }],
      }),
      summary({ project_id: "d", title: "Done one", latest_render: "renders/final.mp4" }),
    ]);
    renderRoute("/");
    expect(await screen.findByText("1 video is waiting for you")).toBeInTheDocument();
    const section = (name: string) => screen.getByRole("region", { name });
    expect(within(section("Waiting for you")).getByText("Waiting one")).toBeInTheDocument();
    expect(within(section("Needs attention")).getByText("Broken one")).toBeInTheDocument();
    expect(within(section("In progress")).getByText("Busy one")).toBeInTheDocument();
    expect(within(section("Recent results")).getByText("Done one")).toBeInTheDocument();
  });

  it("shows a first-run empty state", async () => {
    serve([]);
    renderRoute("/");
    expect(await screen.findByText("No videos yet")).toBeInTheDocument();
  });

  it("refetches when the library stream reports a change", async () => {
    serve([]);
    renderRoute("/");
    await screen.findByText("No videos yet");
    serve([summary({ title: "Fresh video" })]);
    const stream = FakeEventSource.instances.find((s) => s.url === "/api/library/events")!;
    act(() => stream.emit({ type: "change", project_id: "backlot-demo-run" }));
    await new Promise((r) => setTimeout(r, SSE_DEBOUNCE_MS + 50));
    expect(await screen.findByText("Fresh video")).toBeInTheDocument();
  });
});

describe("Library", () => {
  const projects = [
    summary({ project_id: "x", title: "Lighthouse", series: "Coast" }),
    summary({
      project_id: "y",
      title: "Black holes",
      pipeline_type: "animated-explainer",
      stage_states: [{ name: "script", status: "awaiting_human" }],
    }),
  ];

  it("searches and filters by status, keeping filters in the URL", async () => {
    serve(projects);
    const { router } = renderRoute("/library");
    await screen.findByText("Lighthouse");

    await userEvent.type(screen.getByRole("searchbox", { name: "Search videos" }), "black");
    expect(screen.queryByText("Lighthouse")).not.toBeInTheDocument();
    expect(screen.getByText("Black holes")).toBeInTheDocument();
    expect(router.state.location.search).toContain("q=black");

    await userEvent.clear(screen.getByRole("searchbox", { name: "Search videos" }));
    await userEvent.click(screen.getByRole("button", { name: "Waiting for you" }));
    expect(screen.getByText("Black holes")).toBeInTheDocument();
    expect(screen.queryByText("Lighthouse")).not.toBeInTheDocument();
  });

  it("shows plain video-type names and groups by series", async () => {
    serve(projects);
    renderRoute("/library?view=series");
    expect(await screen.findByRole("heading", { name: "Coast" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No series" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Explain a topic" })).toBeInTheDocument();
    expect(screen.queryByText("animated-explainer")).not.toBeInTheDocument();
  });
});

describe("Project page", () => {
  it("renders steps, storyboard and decisions from the demo run", async () => {
    serve([], board());
    renderRoute("/p/backlot-demo-run");
    expect(await screen.findByRole("heading", { name: "The Last Lighthouse" })).toBeInTheDocument();
    const steps = screen.getByRole("list", { name: "Steps" });
    expect(within(steps).getByText("Concept & plan")).toBeInTheDocument();
    expect(within(steps).getAllByText("Done").length).toBeGreaterThan(0);
    expect(screen.getByText("“The coast holds its breath.”")).toBeInTheDocument();
    expect(screen.queryByText(/"version"/)).not.toBeInTheDocument(); // never raw JSON
  });

  it("leads with the review point and opens the matching tab", async () => {
    serve([], waitingAtScript());
    renderRoute("/p/backlot-demo-run");
    expect(await screen.findByText("Waiting for you: review the script")).toBeInTheDocument();
    expect(screen.getByText(/Review it below, or reply in your agent chat/)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Script", selected: true })).toBeInTheDocument();
    expect(screen.getByText("Every night, the same promise.")).toBeInTheDocument();
  });

  it("switches tabs and shows concepts with the chosen one marked", async () => {
    serve([], board());
    renderRoute("/p/backlot-demo-run");
    await userEvent.click(await screen.findByRole("tab", { name: "Concept & plan" }));
    expect(screen.getByText("Chosen")).toBeInTheDocument();
    expect(screen.getByText("The Surprising Truth About X")).toBeInTheDocument();
  });

  it("updates live when the project stream reports a change", async () => {
    serve([], board());
    renderRoute("/p/backlot-demo-run");
    await screen.findByRole("heading", { name: "The Last Lighthouse" });
    serve([], waitingAtScript());
    const stream = FakeEventSource.instances.find((s) =>
      s.url.endsWith("/backlot-demo-run/events"),
    )!;
    act(() => stream.emit({ type: "change", project_id: "backlot-demo-run" }));
    await waitFor(() =>
      expect(screen.getByText("Waiting for you: review the script")).toBeInTheDocument(),
    );
  });

  it("shows a friendly not-found page", async () => {
    serve([]);
    renderRoute("/p/ghost");
    expect(await screen.findByText("Video not found")).toBeInTheDocument();
  });
});
