import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { setLocale } from "@/i18n";
import type { BoardState, Stage } from "@/types/api";
import boardFixture from "@/test/fixtures/board-state.json";
import { StageDrawer } from "./StageDrawer";
import { StepTimeline } from "./StepTimeline";

const board = boardFixture as unknown as BoardState;
const stage = (name: string): Stage => board.stages.find((s) => s.name === name)!;

describe("StageDrawer", () => {
  it("opens from a step and shows versions, history and artifacts", async () => {
    const user = userEvent.setup();
    render(<StepTimeline stages={board.stages} artifacts={board.artifacts} />);
    await user.click(screen.getByRole("button", { name: /Storyboard/i }));
    const dialog = await screen.findByRole("dialog", { name: /Storyboard.*details/i });
    expect(within(dialog).getByText("2 versions")).toBeInTheDocument();
    expect(within(dialog).getByText("History")).toBeInTheDocument();
    expect(within(dialog).getByRole("group", { name: /Summary of Scene Plan/i })).toBeVisible();
  });

  it("says so when a step has produced nothing", () => {
    const pending = {
      ...stage("assets"),
      status: "pending",
      versions: 0,
      history_entries: [],
    } as Stage;
    render(<StageDrawer stage={pending} artifacts={{}} onClose={() => {}} />);
    expect(screen.getByText("This step has not run yet.")).toBeInTheDocument();
    expect(screen.getByText("Nothing on disk for this step yet.")).toBeInTheDocument();
  });

  it("renders in Vietnamese", () => {
    setLocale("vi");
    render(<StageDrawer stage={stage("script")} artifacts={board.artifacts} onClose={() => {}} />);
    expect(screen.getByText("Lịch sử")).toBeInTheDocument();
  });
});
