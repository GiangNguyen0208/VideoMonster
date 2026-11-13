import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { setLocale } from "@/i18n";
import type { BoardState } from "@/types/api";
import boardFixture from "@/test/fixtures/board-state.json";
import { ReplayBar } from "./ReplayBar";
import { replayBounds } from "./replay";

const board = boardFixture as unknown as BoardState;

describe("ReplayBar", () => {
  it("starts a replay from the first moment", async () => {
    const onChange = vi.fn();
    render(<ReplayBar state={board} at={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Replay run" }));
    expect(onChange).toHaveBeenCalledWith(replayBounds(board)!.t0);
  });

  it("scrubs and returns to live", async () => {
    const onChange = vi.fn();
    const { t0 } = replayBounds(board)!;
    render(<ReplayBar state={board} at={t0} onChange={onChange} />);
    expect(screen.getByRole("slider", { name: "Position in the run" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back to live" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("renders nothing when the run has no history", () => {
    const { container } = render(
      <ReplayBar state={{ ...board, stages: [], events: [] }} at={null} onChange={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("speaks Vietnamese", () => {
    setLocale("vi");
    render(<ReplayBar state={board} at={null} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Xem lại" })).toBeInTheDocument();
  });
});
